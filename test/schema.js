const schema = {
    tables: [
        {
            name: 'pgexpress_users_test',
            security: {
                read: (req, res) => {
                    if (req.query.access_token) {
                        return req.query.access_token + ' = id'
                    }
                    return false
                },
                write: (req, res) => {
                    if (req.query.access_token) {
                        return req.query.access_token + ' = id' // Return a string that is readable by postgreSQL
                    }
                    return false
                }
            },
            columns:[
                { column_name:'id',       data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
                { column_name:'email',    data_type: 'character', constraints: 'varying(120) NOT NULL UNIQUE' },
                { column_name:'password', data_type: 'character', constraints: 'varying(60)', hidden:true, encryption: 'adydB7D2L5xh84WmdAEaA18mmBF63CS8' },
                { column_name:'first',    data_type: 'character', constraints: 'varying(60)' },
                { column_name:'last',     data_type: 'character', constraints: 'varying(60)' },
                { column_name:'data',     data_type: 'JSON' }
            ]
        }
    ]
}

module.exports = schema