const express = require('express')
require('dotenv').config({ path:'./.env' })

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
            { column_name:'id', data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true, auth_index: true },
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
schema.append(
    createTable({
        name: 'testTable',
        // require_auth: true,
        columns:[
            { column_name:'test_id', data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
            { column_name:'test_owner', data_type: 'BIGSERIAL', auth_index:true },
            { column_name:'myText', data_type:'text' }
        ]
    })
)

// Call session before this!
app.use(
    (req, res, next) => {
        // Required middleware parameter for this to operate correctly
        req.session = { auth_id: 1 }
        next();
    }
)

// Call body parsing middleware before this!
app.use(express.json())

app.use(
    PostgresExpress({
        mode: 'pool',
        connection: process.env.DATABASE_URL,
        connectionConfig:{
            connectionTimeoutMillis: 0,
            idleTimeoutMillis: 10000,
            max: 10
        },
        migration: false,
        schema
    })
)

app.get('/', (req, res) => res.send('Local index reached'))
app.get('*', (req, res) => { res.send('You have reached the end (404)') })
app.listen(port, () => { console.log(`PG-Express test running at: http://localhost:${port}`) })