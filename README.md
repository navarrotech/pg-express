# pg-express
Automated CRUD generated urls for express based on table schemas

## Installation
```
npm install pg-express
```
or
```
yarn install pg-express
```

Ever get tired of having to write migration, AND crud routes, AND do auth validation for all of your PostGres tables?

## The Goal:
The goal is to merge all 3 above tasks into one, and create a much better workflow based on automated middlewares.

By implementing a front-end framework object and using a single middleware, you can dynamically produce the following output.

## The output:
```å
GET "/db/buckets/1"
  > (Auth check) If row authorized user === current user in session, return row(s) with id of 1
  > (No auth check) return row(s) with id of 1

GET "/db/buckets"
  > Will list all rows this authorized user is allowed to view

GET "/db/buckets?limit=10&offset=10"
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

DELETE "/db/buckets/1"
  > If you are authorized to modify this row, it will delete this row

```

## The setup:
```
const express = require('express')

const {
    PostgresExpress,
    createSchema,
    createTable
} = require('../index.js')

const app = express()
const { port=3000 } = process.env

// Generate a schema that contains all of your data
const schema = createSchema()

// Add you tables to the schema table
// (Automated migration coming soon)
schema.append(
    createTable({
        name: 'users',
        require_auth: true,
        columns:[
            // By adding index:true, this is what will be searched.
            // Consider the following: "SELECT * FROM users WHERE index_column_name = 1" <-- index_column_name is what you're setting with 'index:true'
            { column_name:'id', data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
            { column_name:'email', data_type: 'character', constraints: 'varying(120) NOT NULL UNIQUE' },
            // When this route is called, we don't want to send the password back to the user. So with hide_from_route, it will exist in the database but won't be returned in any CRUD requests.
            { column_name:'password', data_type: 'character', constraints: 'varying(60)', hide_from_route:true },
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
        // Required middleware parameter for this to operate correctly
        req.session = { auth_id: 1 }
        next();
    }
)

// Call body parsing middleware before this!
app.use(express.json())

app.use(
    PostgresExpress({
        // Pool is currently default and only supported, client mode coming soon
        mode: 'pool',
        // Add a connection string like 'postgres://user:pass:5432/database', or a postgres connection object
        connection: '',
        // Any and all configurations in this object get passed when we generate our own connection to postgres.
        connectionConfig:{
            connectionTimeoutMillis: 0,
            idleTimeoutMillis: 10000,
            max: 10
        },
        // Migration is currently not functional, but will be supported soon
        migrate: false,
        // !important: Pass the schema to tell your middleware how to handle the table routes.
        schema
    })
)
```

This is just the beginning, there is much more to come!