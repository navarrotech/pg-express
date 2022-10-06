const express = require('express')
require('dotenv').config({ path:'./test/.env' })

const schema = require('./schema.js')
const PostgresExpress = require('../index-old.js')

const app = express()
const { port = 3000 } = process.env

// Call body parsing middleware before this!
app.use(express.json())

app.use(PostgresExpress({
    mode: 'pool',
    connection: process.env.DATABASE_URL,
    connectionConfig:{
        connectionTimeoutMillis: 0,
        idleTimeoutMillis: 10000,
        max: 10
    },
    verbose:true,
    migration: true,
    schema
}))

app.get('/', (req, res) => res.send('Local index reached'))
app.get('*', (req, res) => { res.send('You have reached the end (404)') })
app.listen(port, () => { console.log(`PG-Express test running at: http://localhost:${port}`) })