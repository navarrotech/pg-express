const axios = require('axios')

axios.defaults.baseURL = 'http://localhost:8080/'

const test_table_name = 'pgexpress_users_test'

describe("Test the root path", () => {
    test("Temp server is alive", () => {
        return axios
            .get("/")
            .then(({data, status}) => {
                expect(status).toBe(200);
            });
    });
});

describe("GET methods", () => {
    test("Block unauthorized requests", () => {
        return axios
            .get(`/db/${test_table_name}/1`, {})
            .catch(({ response: { status } }) => {
                expect(status).toBe(401);
            });
    });
    test("GET /db/table/1", () => {
        return axios
            .get(`/db/${test_table_name}/1?access_token=1`, {  })
            .then(({data, status}) => {
                expect(data.payload.email).toBe("john@smith.com");
            });
    });
    test("hidden routes should not display", () => {
        return axios
            .get(`/db/${test_table_name}/1?access_token=1`, {  })
            .then(({data, status}) => {
                expect(data.payload).toMatchObject({
                    id: "1",
                    email: "john@smith.com",
                    first: 'john',
                    last: 'smith'
                });
            });
    });
    test("LIST /db/table/1", () => {
        return axios
            .get(`/db/${test_table_name}?access_token=1`, {  })
            .then(({data, status}) => {
                expect(data.payload).toMatchObject([{
                    id: "1",
                    email: "john@smith.com",
                    first: 'john',
                    last: 'smith'
                }]);
            });
    });
});

describe("PUT (create) methods", () => {
    test("Block unauthorized requests", () => {
        return axios
            .put(`/db/${test_table_name}/2`, {})
            .catch(({ response: { status } }) => {
                expect(status).toBe(401);
            });
    });
    test("Can't create an existing record ID", () => {
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'id': '1',
                'email': 'samantha@smith.com',
                'password':'mypassword123',
                'first': 'samantha',
                'last':'smith'
            })
            .catch(({ response }) => {
                expect(response.data.message).toBe('Key (id)=(1) already exists.')
            })
    });
    test("PUT /db/table", () => {
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'jacob@smith.com',
                'password':'mypassword123',
                'first': 'jacob',
                'last':'smith'
            })
            .catch(e => {
                console.log(e)
            })
            .then(({data, status}) => {
                expect(data.payload.email).toBe("jacob@smith.com");
                return axios.delete(`/db/${test_table_name}/${data.payload.id}?access_token=${data.payload.id}`)
            })
    });
});

describe("POST (update) methods", () => {
    test("Block unauthorized requests", () => {
        return axios
            .post(`/db/${test_table_name}/1`, {})
            .catch(({ response: { status } }) => {
                expect(status).toBe(401);
            });
    });
    test("DELETE /db/table", () => {
        let id = null;
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'alex@smith.com',
                'password':'mypassword123',
                'first': 'alex',
                'last':'smith'
            })
            .then(({ data, status }) => {
                id = data.payload.id
                return axios.post(`/db/${test_table_name}/${id}?access_token=${id}`, {
                    first: 'alexander'
                })
            })
            .then(({ data, status }) => {
                return axios.get(`/db/${test_table_name}/${id}?access_token=${id}`)
            })
            .then(({data, status}) => {
                expect(data.payload.first).toBe('alexander');
            })
            .then(() => {
                return axios.delete(`/db/${test_table_name}/${id}?access_token=${id}`)
            })
    });
});

describe("DELETE methods", () => {
    test("Block unauthorized requests", () => {
        return axios
            .delete(`/db/${test_table_name}/2`, {})
            .catch(({ response: { status } }) => {
                expect(status).toBe(401);
            });
    });
    test("DELETE /db/table", () => {
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'michael@smith.com',
                'password':'mypassword123',
                'first': 'michael',
                'last':'smith'
            })
            .catch(e => {
                console.log(e)
            })
            .then(({data, status}) => {
                return axios.delete(`/db/${test_table_name}/${data.payload.id}?access_token=${data.payload.id}`)
            })
            .then(({data, status}) => {
                expect(status).toBe(200);
            })
    });
});

describe("Prevent Malicious Input", () => {
    test("Cannot submit a bad JSON in create request", () => {
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'hammond@smith.com',
                'password':'mypassword123',
                'first': 'hammond',
                'last': 'smith',
                'data': JSON.stringify({
                    transactions: [
                        { name: 'one', value: 100 },
                        { name: 'two', value: 200 },
                        { name: 'thr', value: 300 }
                    ]
                }).substring(10)
            })
            .catch(({ response }) => {
                expect(response.status).toBe(409);
            })
    });
    test("Cannot submit a bad JSON in update request", () => {
        let id = null
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'hammond@smith.com',
                'password':'mypassword123',
                'first': 'hammond',
                'last': 'smith',
                'data': JSON.stringify({
                    transactions: [
                        { name: 'one', value: 100 },
                        { name: 'two', value: 200 },
                        { name: 'thr', value: 300 }
                    ]
                })
            })
            .then(({ data }) => {
                id = data.payload.id
                return axios.post(`/db/${test_table_name}/${id}?access_token=${id}`, {
                    data: JSON.stringify({
                        transactions: [
                            { name: 'one', value: 100 },
                            { name: 'two', value: 200 },
                            { name: 'thr', value: 300 }
                        ]
                    }).substring(10)
                })
            })
            .catch(e => expect(e.response.status).toBe(409))
            .finally(() => {
                return axios.delete(`/db/${test_table_name}/${id}?access_token=${id}`)
            })
    });
    test("Special characters get parsed", () => {
        return axios
            .put(`/db/${test_table_name}?access_token=1`, {
                'email': 'porkchop@smith.com',
                'password':'mypassword123',
                'first': `porkchop;SELECT * FROM users LIMIT 100;INSERT INTO ${test_table_name}(email, password) VALUES('malicious_test@smith.com','clever123',`,
                'last': 'smith',
            })
            .catch(({ response }) => {
                expect(response.status).toBe(409);
            })
    });
});