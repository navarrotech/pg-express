const { Client, Pool } = require('pg')

var options = {},
    Postgres

function getConnection(){
    const { connection, mode } = options

    if(typeof connection == 'string'){
        if(options.mode && options.mode === 'pool'){
            return new Pool({
                connectionString: connection,
                ssl: connection.includes('localhost')?false:{
                    rejectUnauthorized: false
                },
                ...((options && options.connectionConfig)?options.connectionConfig:{})
            })
        }
        return new Client({
            connectionString: connection,
            ssl: connection.includes('localhost')?false:{
                rejectUnauthorized: false
            }
        })
    }
    else if(typeof connection == 'object'){
        if(connection && connection.defaults){ // They passed a pg object
            return connection
        }
        else{
            return new Client(connection)
        }
    }
    else {
        throw new Error('[PostgresExpress] :: Invalid connection object. Please provide a connection string, pg object, or JSON with connection details.')
    }
}

function migrate(){
    let { schema } = options
    schema = schema._generate()

    const queries = [],
        issues = []

    
    // Check that all tables exist
    schema
        .filter(a => a.type === 'table')
        .forEach(table => {
            queries.push(`CREATE IF NOT EXISTS ${table.name} (${
                table.columns.map(a => {
                    if(!a.column_name){ issues.push(`Missing column_name for a column in table (${table.name})`); return; }
                    if(!a.data_type){ issues.push(`Missing data_type for column (${a.column_name}) in table (${table.name})`); return; }
                    return a.column_name + ' ' + a.data_type + (a.constraints?(' ' + a.constraints):'')
                }).join(',')
            })`)
        })
        
    // Check that all columns exist & are formatted correctly
    schema
        .filter(a => a.type === 'table')
        .forEach(table => {
            table.columns.forEach(column => {
                if(!column.column_name || !column.data_type){ return; }
                // queries.push(`SELECT ${column.column_name} FROM information_schema.columns WHERE table_name='${table.name}' and column_name='${column.column_name}';`)
                queries.push(`ALTER TABLE ${table.name} ADD COLUMN IF NOT EXISTS ${column.column_name} ${column.data_type} ${column.constraints?column.constraints:''}`)
            })
        })

    if(options.verbose){
        console.log('[PostgresExpress] Beginning Migration: ', queries)
    }

    // Postgres
    //     .query(queries.join(';'))
    //     .catch(e => { console.log('[PostgresExpress]', e.stack) })
    //     .then(() => { if(options.verbose){ console.log('[PostgresExpress] Migration finished') } })
}

function generateAPI(){
    let { schema } = options

    schema = schema._generate()
    
    const paths = Object
        .values(schema)
        .map(p => { if(p.type === 'table'){ return p.name } else { return '' } })

    return function(req, res, next){
        const auth_session_id = req.session && req.session.auth_id ? req.session.auth_id : null
        // TODO: Sorting
        // TODO: Built in encryption

        const path = req.path

        let db_table = null,
            row_id = null

        console.log({paths})

        paths.forEach(function(p){
            if(path.startsWith('/db/' + p)){ // Get the table
                db_table = schema.find(a => a.name === p)
            }
        })

        if(db_table && db_table.name){
            row_id   = path.substring(('/db/'+db_table.name).length+1)
            row_id   = row_id.includes('/')
                ? row_id.substring(0, row_id.indexOf('/'))
                : row_id
                
            let auth_column = db_table.columns.find(a => a.auth_index)
            if(db_table.require_auth){
                if(!auth_session_id){
                    return res.status(401).send({
                        success: false,
                        payload: null,
                        message: 'This table requires authorization but this session is not intialized. Could not find [req.session.user.auth_id]!'
                    })
                }
                if(!auth_column){
                    return res.status(401).send({
                        success: false,
                        payload: null,
                        message: 'This table requires authorization but no column has been designated as the auth_index!'
                    })
                }
            }

            // Get index column that we search through.
            // For example: "WHERE user_id = 10;" <-- Index would be "user_id"
            let index = db_table.columns.find(a => a.index)
            if(index && index.column_name){ index = index.column_name }
            else{ throw new Error('Index not set for table ' + db_table.name) }
            
            let queryString = ''
            let queryParams = []
            let auth_insert = db_table.require_auth ? (auth_column.column_name + ' = ' + auth_session_id) : ''

            // For lists
            if(req.method === 'GET' && !row_id){

                let limit = (req.query.limit) ? parseInt(req.query.limit) : ''
                if(limit && isNaN(limit)){ limit = 25 }
                if(!limit){ limit = 25 }

                let offset = (req.query.offset) ? parseInt(req.query.offset) : ''
                if(offset && isNaN(offset)){ offset = 0 }
                if(!offset){ offset = 0 }

                queryString += 'SELECT * FROM '
                queryString += db_table.name
                queryString += ' WHERE '
                queryString += auth_insert
                queryString += ' LIMIT ' + limit
                queryString += ' OFFSET ' + offset
                queryString += ';'

                // console.log({ queryString })

                return Postgres
                    .query(queryString)
                    .then((result) => {
                        let payload = result.rows.length ? result.rows : null

                        // Filter out hidden columns
                        if(payload){
                            return res.send({
                                success: true,
                                payload: filterPayload(payload, db_table.columns),
                                message:'success'
                            })
                        }
                        else {
                            return res.status(200).send({ success: false, payload: null, message: 'row not found' })
                        }

                    });
            }

            // Validation: Put request does not require create method
            if(req.method !== 'PUT' && !row_id){
                return res.status(400).send({ success: false, payload: null, message: 'You forgot to include an id in your request\'s path!' })
            }

            // GET row
            if(req.method === 'GET'){ 
                queryString += 'SELECT * FROM '
                queryString += db_table.name
                queryString += ' WHERE '
                queryString += (auth_insert?auth_insert+' AND ':'')
                queryString += index
                queryString += ' = '
                queryString += row_id
                queryString += ';'
            }
            // CREATE row
            else if(req.method === 'PUT'){ 
                let cols = []
                if(req.body){
                    Object
                        .keys(req.body)
                        .forEach(key => {
                            let col = (db_table && db_table.columns.find(a => a.column_name === key)) || null
                            if(!col){ return; }
                            cols.push({ column:col, value: req.body[key] })
                        })
                }
                else {
                    console.warn('[PostgresExpress] Warning: req.body is null and we couldn\'t process your PUT request! Make sure to use a body parser before calling PostgresExpress middleware.')
                    return res.status(500).send({ success: false, payload: null, message: 'No request body found: Unable to process query' })
                }

                queryString += 'INSERT INTO '
                queryString += db_table.name
                queryString += '('
                queryString += (cols.map(a => a.column.column_name).join(','))
                queryString += ') '
                queryString += 'VALUES ('
                queryString += (cols.map((a,i) => '$' + (i+1)).join(','))
                queryString += ') '
                queryString += 'RETURNING *;'

                queryParams = cols.map(a => a.value)
            } 
            // UPDATE row
            else if(req.method === 'POST'){ 

                let cols = []
                if(req.body){
                    Object
                        .keys(req.body)
                        .forEach(key => {
                            let col = (db_table && db_table.columns.find(a => a.column_name === key)) || null
                            if(!col){ return; }
                            cols.push({ column:col, value: req.body[key] })
                        })
                }
                else {
                    console.warn('[PostgresExpress] Warning: req.body is null and we couldn\'t process your POST request! Make sure to use a body parser before calling PostgresExpress middleware.')
                    return res.status(500).send({ success: false, payload: null, message: 'No request body found: Unable to process query' })
                }

                queryString += 'UPDATE '
                queryString += db_table.name

                queryString += ' SET '
                queryString += (cols.map((a,i) => a.column.column_name + ' = $' + (i+1)).join(','))

                queryString += ' WHERE '
                queryString += (auth_insert?auth_insert+' AND ':'')
                queryString += index
                queryString += ' = '
                queryString += row_id
                queryString += ' RETURNING *;'

                queryParams = cols.map(a => a.value)
            } 
            // DELETE row
            else if(req.method === 'DELETE'){ 
                queryString += 'DELETE FROM '
                queryString += db_table.name
                queryString += ' WHERE '
                queryString += (auth_insert?auth_insert+' AND ':'')
                queryString += index
                queryString += ' = '
                queryString += row_id
                queryString += ' RETURNING *;'
            }

            console.log({ queryString })
            if(['PUT', 'POST'].includes(req.method)){
                console.log({ queryParams })
                return res.send('Completed')
            }

            if(queryString){
                return Postgres
                    .query(queryString, queryParams)
                    .then((result) => {
                        let payload = result.rows.length ? result.rows : null

                        // Filter out hidden columns
                        if(payload){
                            payload = filterPayload(payload, db_table.columns)
                            payload = payload[0]
                            return res.send({
                                success: true,
                                payload,
                                message:'success'
                            })
                        }
                        else {
                            return res.status(200).send({ success: false, payload: null, message: 'row not found' })
                        }
                    })
            }
            return res.status(500).send({ success: false, payload: null, message: 'Internal error: Unable to process query' })
        }
        else {
            next()
        }
    }
}

// Filter handles:
//   > Encryption
//   > Hidden columns
function filterPayload(payload, columns){
    columns.forEach(column => {
        if(!column.hide_from_route){ return }
        payload.forEach(row => {
            if(row && row[column.column_name]){ delete row[column.column_name] }
        })
    })
    return payload;
}

function PostgresExpress(opts){

    // Validation

    if(!opts){ throw new Error('[PostgresExpress] :: No options found! Please pass an object as the single function parameter when calling pg-express'); }

    const { connection } = opts

    if(!connection){ throw new Error('[PostgresExpress] :: A connection object has not been provided to connect to postgres with!') }

    options = opts

    // Connect + Create
    Postgres = getConnection()

    Postgres
        .connect()
        .catch(err => console.error('[PostgresExpress]', err.stack))
        .then(() => {
            if(options.migration){ migrate() }
        })

    // Postgres routing
    return generateAPI()
}

function createSchema(){
    const data = []
    return {
        append:function(item){ data.push(item); },
        _generate:function(){ return data }
    }
}

function createTable(table){
    return {
        type: 'table',
        ...table
    }
}

module.exports = {
    PostgresExpress,
    createSchema,
    createTable
}