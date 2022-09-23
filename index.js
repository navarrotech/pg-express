const { Client, Pool } = require('pg')

var options = {},
    tables = [],
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

function generateAPI(){
    let { schema } = options

    schema = schema._generate()
    
    const paths = Object
        .values(schema)
        .map(p => { if(p.type === 'table'){ return p.name } else { return '' } })

    return function(req, res, next){
        const auth_session_id = req.session && req.session.auth_id ? req.session.auth_id : null
        // TODO: Sort
        // TODO: Auth rules && Auth implementation
        // TODO: Built in encryption

        const path = req.path

        let db_table = null,
            row_id = null

        paths.forEach(function(p){ if(path.startsWith('/db/' + p)){
            db_table = schema.find(a => a.name === p) } // Get the table
            row_id   = path.substring(('/db/'+p).length+1)
            row_id   = row_id.includes('/')
                ? row_id.substring(0, row_id.indexOf('/'))
                : row_id
        })

        if(db_table && db_table.name){
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
            let auth_insert = db_table.require_auth ? (auth_column.column_name + ' = ' + auth_session_id) : ''

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
                queryString += 'INSERT INTO '
                queryString += db_table.name

                // TODO: Get columns from req.body && insert column=value stuff

                queryString += 'RETURNING *;'
            } 
            // UPDATE row
            else if(req.method === 'POST'){ 
                queryString += 'UPDATE '
                queryString += db_table.name

                // TODO: Get columns from req.body && insert column=value stuff

                queryString += ' WHERE '
                queryString += (auth_insert?auth_insert+' AND ':'')
                queryString += index
                queryString += ' = '
                queryString += row_id
                queryString += 'RETURNING *;'
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
                queryString += 'RETURNING *;'
            }

            // console.log({ queryString })

            if(queryString){
                return Postgres
                    .query(queryString)
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
//     > Encryption
//     > Hidden columns

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

    const { schema, connection } = opts

    // if(!schema){ throw new Error('[PostgresExpress] :: A schema has not been provided for pg-express! Please add a .sql schema file to continue'); }
    if(!connection){ throw new Error('[PostgresExpress] :: A connection object has not been provided to connect to postgres with!') }

    options = opts

    // Connect + Create
    Postgres = getConnection()

    Postgres
        .connect()
        .catch(err => console.error('[PostgresExpress]', err.stack))

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