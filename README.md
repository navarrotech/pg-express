# pg-express
Lightweight automated CRUD generated public urls, with session based authentication checks for express based on table schemas, with automated migration.

## Installation
```
npm install pg-express
```
or
```
yarn install pg-express
```
## The Goal:
Ever get tired of having to write migration, AND crud routes, AND do auth validation for all of your PostGres tables?

The goal is to create a much better workflow for:
  * Public CRUD Postgres operations
  * Authentication verification
  * Value parsing & string safety checks
  * Postgres migration between environments and computers

By defining a front-end framework and using express middleware, you can dynamically use the following urls publicly to use CRUD faster!

## The output:
```
GET "/db/users/1"
  > (Auth check) If row authorized user === current user in session, return row(s) with id of 1
  > (No auth check) return row(s) with id of 1

GET "/db/users"
  > Will list all rows this authorized user is allowed to view

GET "/db/users?limit=10&offset=10"
  > Will list all rows this user is authorized to view, with pagination
  > Pagination defaults to limit 25 and offset 0 when unset.

POST "/db/users/1"
with BODY { "first":"Alex" }
  > If you are user with id of 1, you can update this row
  > Any parameter in JSON body request with key matching a column from your schema will be updated
  > In body the key "first" matches column "first" in table "users" so column "first" and row 1 will be updated to value "Alex"

PUT "/db/users"
with BODY {
    "first":    "Alex",
    "last":     "Navarro",
    "email":    "alex@navarrotech.net",
    "password": "keyboard-cat"
}
  > Creates a new row using form body as columns that match column_names
  > In this case, it will match each body key (first, last, email, password) with the columns in our schema (first, last, email, password) and create a new row with those values.

DELETE "/db/users/1"
  > If you are authorized to modify this row, it will delete this row

```

## The setup:
```
const express = require('express')

const PostgresExpress = require('../index.js')

const app = express()
const { port=3000 } = process.env

// Generate a schema, so 
const schema = {
    tables: [
        {
            name: 'users',
            security: {
                read: (req, res) => {
                    // Anyone can read any row in this table
                    return true 
                },
                write: (req, res) => {
                    // Write your own authorization rules! 
                    if (req.session && req.session.user && req.session.user.id) {
                        // Return a string that will compare a column to a value.
                        // In this case, we return 'id = x' which our route will automatically compare with a "WHERE" operator.
                        // The example below says the column "id" must match the user's session id in order to be editable
                        return 'id = ' + req.session.user.id
                    }
                    return false // Return false to deny any editing
                }
            },
            columns:[
                { column_name:'id',       data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
                { column_name:'email',    data_type: 'character', constraints: 'varying(120) NOT NULL UNIQUE' },
                { column_name:'password', data_type: 'character', constraints: 'varying(60)', hidden:true, encryption: '12345678901234567890123456789012' },
                { column_name:'first',    data_type: 'character', constraints: 'varying(60)' },
                { column_name:'last',     data_type: 'character', constraints: 'varying(60)' }
            ]
        }
    ]
}

// Call body parsing middleware before this!
app.use(express.json())

app.use(
    PostgresExpress({
        // Pool is currently default and only supported, client mode coming soon
        mode: 'pool',
        // Add a connection string like 'postgres://user:pass:5432/database', or a PG connection object
        connection: '',
        // Any and all configurations in this object get passed if it generates it's own connection to pg object.
        connectionConfig:{
            connectionTimeoutMillis: 0,
            idleTimeoutMillis: 10000,
            max: 10
        },
        // Migration will ensure tables and columns exist whenever booted onto new server or local environments.
        migrate: true,
        // !important: Pass the schema to tell your middleware how to handle the table routes.
        schema
    })
)
```

This is just the beginning, there is much more to come!