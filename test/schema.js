const schema = {
    tables: [
        {
            name: 'users',
            security: {
                read: (req, res) => {
                    if (req.session && req.session.user && req.session.user.id) {
                        return req.session.user.id + ' = id'
                    }
                    return false
                },
                write: (req, res) => {
                    if (req.session && req.session.user && req.session.user.id) {
                        return req.session.user.id + ' = id' // Return a string that is readable by postgreSQL
                    }
                    return false
                }
            },
            columns:[
                { column_name:'id',       data_type: 'BIGSERIAL', constraints: 'NOT NULL PRIMARY KEY', index:true },
                { column_name:'email',    data_type: 'character', constraints: 'varying(120) NOT NULL UNIQUE' },
                { column_name:'password', data_type: 'character', constraints: 'varying(60)', hide_from_route:true, encryption: 'adydB7D2L5xh84WmdAEaA18mmBF63CS8Zj99T8lfe1077I8ya2Jng0d8V2UP50jASH4sd3VvOKEKg2OmW2Axod6xIAppCLvV0ydScdLjV3X9fz6wS8PipFxi3H08oMzK' },
                { column_name:'first',    data_type: 'character', constraints: 'varying(60)' },
                { column_name:'last',     data_type: 'character', constraints: 'varying(60)' }
            ]
        }
    ]
}

export default schema