const { Client, Pool } = require('pg')
const crypto = require('crypto')

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

    const queries = [],
        issues = []

    // Check that all tables exist
    schema
        .tables
        .forEach(table => {
            queries.push(`CREATE TABLE IF NOT EXISTS ${table.name} (${
                table.columns.map(a => {
                    if(!a.column_name){ issues.push(`Missing column_name for a column in table (${table.name})`); return; }
                    if(!a.data_type){ issues.push(`Missing data_type for column (${a.column_name}) in table (${table.name})`); return; }
                    return a.column_name + ' ' + a.data_type + (a.constraints?(' ' + a.constraints):'')
                }).join(',')
            })`)
        })
        
    // Check that all columns exist & are formatted correctly
    schema
        .tables
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

    Postgres
        .query(queries.join(';'))
        .catch(e => { console.log('[PostgresExpress]', e.stack) })
        .then(() => { if(options.verbose){ console.log('[PostgresExpress] Migration finished') } })
}

const encrypt = (text, key) => {

    let cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.from("NHSQB1yH8Grnyf8a") );
    let encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return encrypted.toString('hex')
}
const decrypt = (text, key) => {

    let decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.from("NHSQB1yH8Grnyf8a"), 'hex');
    let decrpyted = Buffer.concat([decipher.update(Buffer.from(String(text), 'hex')), decipher.final()]);

    return decrpyted.toString()
}

function generateAPI(){
    const { schema:{ tables } } = options

    return function (req, res, next) {
        function RAISE(message) {
            return res.status(400).send({ success: false, payload: null, message })
        }
        function RAISE_AUTH() {
            return res.status(401).send({
                success: false,
                payload: null,
                message: 'This table requires authorization that you do not have to view this table!'
            })
        }
        function getRowID() {
            // From /db/user/1/test to 1/test
            let id = req.path.substring(('/db/' + table.name).length + 1)
            // From 1/test to 1
            if (id.includes('/')) { id.substring(0, id.indexOf('/')) }
            
            return id;
        }
        
        const table = tables.find(t => req.path.startsWith('/db/' + t.name))
        if (!table) { return next(); }
        
        const table_name = table.name

        let query = '',
            queryParams = []
        
        let table_index = table.columns.find(table => table.index) || table.columns.find(column => column.constraints.includes('PRIMARY KEY'));
        
        let can_read = ''
        if (table.security && table.security.read != undefined) {
            can_read = table.security.read
            
            // The auth check should be mostly function based
            if (typeof can_read === 'function') { can_read = can_read(req,res) }

            // If the user's function failed to return a good value, or if the user put/returned "false" or "null" or "undefined" in the check then don't allow anyone to do anything.
            if (!can_read && req.method === 'GET') { return RAISE_AUTH(); }

            // If the user puts in "true" for all read commands, then always allow the commands
            if(typeof can_read === 'boolean'){ can_read = '' }
        }
        
        let can_write = '';
        if (table.security && table.security.write != undefined) {
            can_write = table.security.write
            
            // The auth check should be mostly function based
            if (typeof can_write === 'function') { can_write = can_write(req,res) }

            // If the user's function failed to return a good value, or if the user put/returned "false" or "null" or "undefined" in the check then don't allow anyone to do anything.
            if (!can_write && req.method !== 'GET') { return RAISE_AUTH(); }

            // If the user puts in "true" for all read commands, then always allow the commands
            if(typeof can_write === 'boolean'){ can_write = '' }
        }

        if (options.verbose) {
            console.log(`[PostgresExpress] :: Incoming ${req.method} request`)
            console.log(`  > Original url: (${req.path}) `)
            console.log(`  > can_write: '${can_write}' | can_read: '${can_read}'`)
            console.log(`  > table: '${table_name}'`)
            console.log(`  > table_index: ${(table_index&&table_index.column)||'undefined'} | row_id: '${getRowID()}'`)
        }
        
        let cols = []
        switch (req.method) {
            case "PUT": // Create
                if(!can_write){ return RAISE_AUTH() }
                
                if(req.body){
                    Object
                        .keys(req.body)
                        .forEach(key => {
                            let col = (table.columns.find(a => a.column_name === key)) || null
                            if (!col) { return; }

                            let value = req.body[key]

                            // Encryption Check
                            if (col.encryption && typeof col.encryption === 'string') {
                                value = encrypt(value, col.encryption)
                            }
                            
                            cols.push({ column:col, value })
                        })
                }
                else {
                    console.warn('[PostgresExpress] Warning: req.body is null and we couldn\'t process your POST request! Make sure to use a body parser before calling PostgresExpress middleware.')
                    return res.status(500).send({ success: false, payload: null, message: 'No request body found: Unable to process query' })
                }

                queryParams = cols.map(a => a.value)
                query = `INSERT INTO ${table.name} (${cols.map(a => a.column.column_name).join(',')}) VALUES (${cols.map((a,i) => '$' + (i+1)).join(',')}) RETURNING *;`
                break;
            default:
            case "GET": // Read
                // Get single
                if (getRowID()) {
                    if(!table_index){ return RAISE('Searchable index has not been set for this table!') }
                    query = `SELECT * FROM ${table.name} WHERE ${can_read?(can_read+' AND '):''} ${table_index.column_name} = ${getRowID()};`
                }
                // List multiple
                else {
                    let limit = (req.query.limit) ? parseInt(req.query.limit) : ''
                    if(limit && isNaN(limit)){ limit = 25 }
                    if(!limit){ limit = 25 }

                    let offset = (req.query.offset) ? parseInt(req.query.offset) : ''
                    if(offset && isNaN(offset)){ offset = 0 }
                    if(!offset){ offset = 0 }

                    let sort_pattern = (req.query.ascending || req.query.sort_asc)
                        ? 'ASC'
                        : (req.query.descending || req.query.sort_desc)
                        ? 'DSC'
                        : 'ASC' // Default

                    let sort = (req.query.sort) ? db_table.columns.find(a => a.column_name === req.query.sort) : ''
                    if(sort){ sort = ' ORDER BY ' + sort.column_name + ' ' + sort_pattern }
                    if (!sort) { sort = '' }
                    
                    query = `SELECT * FROM ${table.name} ${can_read?'WHERE ' + can_read:''} LIMIT ${limit} OFFSET ${offset} ${sort};`
                }
                break;
            case "POST": // Update
                if(!can_write){ return RAISE_AUTH() }
                
                let queryString = ''
                if(req.body){
                    Object
                        .keys(req.body)
                        .forEach(key => {
                            let col = (table && table.columns.find(a => a.column_name === key)) || null
                            if (!col) { return; }
                            
                            let value = req.body[key]

                            // Encryption Check
                            if (col.encryption && typeof col.encryption === 'string') {
                                value = encrypt(value, col.encryption)
                            }

                            cols.push({ column:col, value })
                        })
                }
                else {
                    console.warn('[PostgresExpress] Warning: req.body is null and we couldn\'t process your POST request! Make sure to use a body parser before calling PostgresExpress middleware.')
                    return res.status(500).send({ success: false, payload: null, message: 'No request body found: Unable to process query' })
                }
                
                queryParams = cols.map(a => a.value)

                query = `UPDATE ${table.name} SET ${cols.map((a,i) => a.column.column_name + ' = $' + (i+1)).join(',')} WHERE ${(can_write?can_write+' AND':'')} ${table_index.column_name} = ${getRowID()} RETURNING *;`
                break;
            case "DELETE": // Delete
                query = `DELETE FROM ${table.name} WHERE ${can_write?can_write+' AND':''} ${table_index.column_name} = ${getRowID()} RETURNING *;`
                break;
        }

        // Fallback
        if (!query) {
            return res.status(500).send({ success: false, payload: null, message: 'Internal error: Unable to process query' })
        }

        if (options.verbose) { console.log(`  QUERY: "${query}" + [${queryParams.join(', ')}]`) }

        return Postgres
            .query(query, queryParams)
            .catch(e => {
                // console.log('[PostgresExpress]', e);
                return res.status(500).send({ success: false, payload: null, message: e.detail })
                return null
            })
            .then((result) => {
                if (!result || !result.rows) { return; }
                let payload = result.rows.length ? result.rows : null

                // Row not found error
                if (!payload) {
                    return res.status(200).send({ success: false, payload: null, message: 'Row not found' })
                }

                // Each column may have something unique!
                const excluded_columns = table.columns
                    .filter(column => column.hidden)
                    .map   (column => column.column_name)
                
                const encrypted_columns = table.columns
                    .filter(column => column.encryption)
                
                payload.forEach(row => {
                    // Decryption
                    // encrypted_columns.forEach(schema_row => {
                    //     let encrypted_row = row[schema_row.column_name]
                    //     if (encrypted_row) {
                    //         if (typeof schema_row.encryption === 'string') {
                    //             encrypted_row = decrypt(encrypted_row, schema_row.encryption)
                    //         }
                    //         if (typeof schema_row.encryption === 'function') {
                    //             encrypted_row = schema_row.encryption(req, res, encrypted_row)
                    //         }
                    //     }
                    // })

                    // Filter out hidden columns
                    excluded_columns.forEach(hidden_key => {
                        if(row[hidden_key]){ delete row[hidden_key] }
                    })
                })

                // Lists get arrays, everything else is single
                if (!(req.method === 'GET' && !getRowID())) {
                    payload = payload[0]
                }

                // Send the final payload
                return res.send({
                    success: true,
                    payload,
                    message:'success'
                })
            })
    }
}

module.exports = function PostgresExpress(opts){

    // Validation
    if(!opts){ throw new Error('[PostgresExpress] :: No options found! Please pass an object as the single function parameter when calling pg-express'); }

    const { connection } = opts
    if (!connection) { throw new Error('[PostgresExpress] :: A connection object has not been provided to connect to postgres with!') }
    
    // Warnings + Proactive checks
    opts.schema.tables.forEach(table => {
        table.columns.forEach(column => {
            if (column.encryption) {
                if (typeof column.encryption !== 'string') { throw new Error(`[PostgresExpress] Encryption on column '${column.column_name}' must be of type 'string' (received type '${typeof column.encryption}')`) }
                if(column.encryption.length != 32){ throw new Error(`[PostgresExpress] Encryption on column '${column.column_name}' must be exactly 32 characters long! (Received ${column.encryption.length})`) }
            }
        })
    })

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