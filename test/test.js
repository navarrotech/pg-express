const express = require('express')
require('dotenv').config({ path:'./test/.env' })

const schema = require('./schema.js')
const PostgresExpress = require('../index.js')

const app = express()
const { PORT = 8080, DATABASE_URL } = process.env

const { Client } = require('pg')
const client = new Client()

// Call body parsing middleware before this!
app.use(express.json())

app.use(PostgresExpress({
    mode: 'pool',
    connection: DATABASE_URL,
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

// Ensure there is a single record in the test table!
client
    .connect()
    .then(() => {
        return client.query('SELECT * FROM pgexpress_users_test WHERE id = 1')
    })
    .then((res) => {
        if (res.rows.length) {
            return null
        }
        return client.query('INSERT INTO pgexpress_users_test(id, email, password, first, last) VALUES ($1,$2,$3,$4,$5)', [
            1, 'john@smith.com', 'password123', 'john', 'smith'
        ])
    })

app.listen(PORT, () => { console.log(`PG-Express test running at: http://localhost:${PORT}`) })