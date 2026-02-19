const ldap = require('ldapjs');

const LDAP_URL = process.env.LDAP_URL || 'ldap://ldap.cc.iitk.ac.in:389';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'ou=People,dc=iitk,dc=ac,dc=in';

const authenticate = (username, password) => {
    return new Promise((resolve, reject) => {
        console.log(`[LDAP] Attempting auth for ${username}`);
        const client = ldap.createClient({
            url: LDAP_URL,
            timeout: 5000,
            connectTimeout: 5000
        });

        client.on('error', (err) => {
            console.error('[LDAP] Client Error:', err);
            client.unbind();
            reject(err);
        });

        // 1. Bind Anonymously to Search
        console.log('[LDAP] Binding anonymously...');
        client.bind('', '', (err) => {
            if (err) {
                console.error('[LDAP] Anonymous bind failed:', err);
                client.unbind();
                return reject(new Error('LDAP Server Connection Failed'));
            }
            console.log('[LDAP] Anonymous bind success. Searching...');

            const searchOptions = {
                filter: `(uid=${username})`,
                scope: 'sub',
                attributes: ['dn', 'uid', 'cn', 'mail'] // Fetch needed attributes
            };

            client.search(LDAP_BASE_DN, searchOptions, (err, res) => {
                if (err) {
                    client.unbind();
                    return reject(err);
                }

                let userDN = null;
                let userEntry = null;

                res.on('searchEntry', (entry) => {
                    userDN = entry.objectName;

                    // Manually construct userEntry from attributes
                    userEntry = {};
                    if (entry.attributes) {
                        entry.attributes.forEach((attr) => {
                            if (attr.vals && attr.vals.length > 0) {
                                userEntry[attr.type] = attr.vals[0];
                            }
                        });
                    }
                });

                res.on('searchReference', (referral) => {
                    // console.log('referral: ' + referral.uris.join());
                });

                res.on('error', (err) => {
                    console.error('[LDAP] Search Error:', err);
                    client.unbind();
                    reject(err);
                });

                res.on('end', (result) => {
                    if (result.status !== 0) {
                        client.unbind();
                        return reject(new Error('LDAP Search Error: ' + result.status));
                    }

                    if (!userDN) {
                        client.unbind();
                        return resolve(null); // User not found
                    }

                    // 2. Bind with User DN and Password
                    console.log(`[LDAP] Binding as user: ${userDN.toString()}`);
                    client.bind(userDN.toString(), String(password), (err) => {
                        client.unbind(); // Always unbind after auth attempt
                        if (err) {
                            if (err.name === 'InvalidCredentialsError') {
                                return resolve(null); // Valid user, wrong password
                            }
                            return reject(err);
                        }
                        // Auth Successful
                        console.log('[LDAP] Auth successful for:', userDN.toString());
                        console.log('[LDAP] User Entry:', JSON.stringify(userEntry));

                        const safeEntry = userEntry || {};
                        resolve({
                            uid: safeEntry.uid || username,
                            name: safeEntry.cn || username,
                            email: safeEntry.mail || '',
                            dn: userDN
                        });
                    });
                });
            });
        });
    });
};

module.exports = { authenticate };
