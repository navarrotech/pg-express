const express = require('express')

const {
    PostgresExpress,
    createSchema,
    createTable
} = require('../index.js')

const app = express()
const { port=3000 } = process.env

const schema = createSchema()
schema.append(
    createTable({
        name: 'users',
        require_auth: true,
        columns:[
            { column_name:'id', data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true, auth_id: true },
            { column_name:'email', data_type: 'character', constraints: 'varying(120) NOT NULL UNIQUE' },
            { column_name:'password', data_type: 'character', constraints: 'varying(60)', hide_from_route:true, encryption: 'keyboard-cat' },
            { column_name:'first', data_type: 'character', constraints: 'varying(60)' },
            { column_name:'last', data_type: 'character', constraints: 'varying(60)' }
        ]
    })
)
schema.append(
    createTable({
        name: 'buckets',
        require_auth: true,
        columns:[
            { column_name:'bucket_id', data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
            { column_name:'bucket_owner', data_type: 'INT', constraints: 'varying(60)', auth_index:true }
        ]
    })
)

// Call session before this!
app.use(
    (req, res, next) => {
        req.session = { auth_id: 1 }
        next();
    }
)

app.use(
    PostgresExpress({
        mode: 'pool',
        connection: '',
        connectionConfig:{
            connectionTimeoutMillis: 0,
            idleTimeoutMillis: 10000,
            max: 10
        },
        createDatabase: false,
        schema
    })
)

app.get('/', (req, res) => res.send('Local index reached'))
app.get('*', (req, res) => { res.send('You have reached the end (404)') })
app.listen(port, () => { console.log(`PG-Express test running at: http://localhost:${port}`) })