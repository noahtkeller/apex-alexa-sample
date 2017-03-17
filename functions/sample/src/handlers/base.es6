const request = require('request-promise');

const jiraProjectKeyMap = {
    TWCCA: `<say-as interpret-as="spell-out">TWCCA</say-as>`,
    SSD: `<say-as interpret-as="spell-out">SSD</say-as>`,
    JWA: `<say-as interpret-as="spell-out">JWA</say-as>`
};

const accountNameMap = {
    'Upmc Passavant': `<say-as interpret-as="spell-out">UPMC</say-as> Passahvaunt`,
    'Kum & Go, L.C.': 'Come and go',
    'LIN Media LLC (dba Media General)': 'LIN Media',
    'Align Technology, Inc.': 'Align Technology',
    'Mobiquity Inc.': 'Mobiquity',
    'Weather Group Television, LLC': 'Weather group',
    'Kinvey, Inc.': `<say-as interpret-as="spell-out">JWA</say-as>`,
    'Walmart Labs -US': 'Walmart labs',
    'Bain & Co.': 'Bain and company'
};

function jiraReducer(col, issue, idx, orig) {
    const key = issue.key;
    let first = 2, second = 2, i = 0, longNumber = '';
    let [projectKey, issueNumber] = key.split('-');
    if (issueNumber.length % 2 === 1) {
        first = 1;
    }
    while (i < issueNumber.length) {
        longNumber += ' ' + issueNumber.substr(i, i > 0 ? second : first);
        i += i > 0 ? second : first;
    }
    col += (idx > 0 ? ', ' : '');
    if (idx === orig.length - 1) {
        col += ' and ';
    }
    col += (jiraProjectKeyMap[projectKey] || projectKey) + longNumber;
    return col;
}

function forceReducer(col, ticket, idx, orig) {
    return col;
}

function entitlementReducer(col, accountId, idx, orig) {
    const entitlement = this.result[accountId];
    if (idx > 0) {
        col += ', ';
    }
    if (idx === orig.length - 1) {
        col += 'and ';
    }
    col += accountNameMap[entitlement.name] || entitlement.name;
    return col;
}

export const handler = {

    async GetTicketsIntent() {

        const self = this
            // , intent = self.event.request.intent
            ;

        // service is hardcoded until salesforce portion works
        let service = 'jira';

        // Only jira works for now, no salesforce
        // let service = intent.slots.service.value;
        // if (service === 'jared' || service === 'jeera' || service === 'jerk') {
        //     service = 'jira';
        // } else if (service === 'salesforce') {
        //     service = 'sales force';
        // }

        let collector = `Your open ${service} tickets are: `
            , requestPath = service === 'jira' ? 'jira/my-issues' : 'salesforce/my-open-issues'
            , reducer = service === 'jira' ? jiraReducer : forceReducer
            ;

        function __GetTicketsIntent() {


            const self = this
                , jira = self.jira
                , jql = `assignee=nkeller AND resolution = 'Unresolved'`
                ;

            return new Promise((resolve, reject) => jira.search.search({jql}, (err, result) => err ? reject(err) : resolve(result)));

        }

        // This just calls __GetTicketsIntent on an ec2, didn't know best practice to secure my credentials in Lambda so I did it this way
        request.get(`http://54.226.20.93:8393/collection/${requestPath}`)
            .then(function (res) {
                const result = JSON.parse(res).data;
                const issues = result.issues.reduce(reducer, collector);
                self.emit(":tell", issues);
            })
            .catch(function (e) {
                console.log(e);
                self.emit(":tell", 'There was an issue retrieving your tickets');
            });

    },

    async GetActiveSupportAccountsIntent() {

        const self = this
            , intent = self.event.request.intent
            ;

        function* __GetActiveSupportAccountsIntent() {

            const self = this
                , jsforce = self.jsforce
                ;

            function entitlementReducer(collector, entitlement) {
                const accountId = entitlement.AccountId;
                collector[accountId] = {
                    id: accountId
                };
                return collector;
            }

            const activeEntitlements = yield jsforce.query("SELECT AccountId FROM Entitlement WHERE Status != 'Expired'")
                , accounts = activeEntitlements.records.reduce(entitlementReducer, {})
                ;

            for (let accountId in accounts) {

                let account = accounts[accountId]
                    , infoResults = yield jsforce.query(`SELECT Name FROM Account WHERE Id = '${accountId}'`)
                    , accountInfo = infoResults.records.length && infoResults.records[0] || null
                    ;
                if (accountInfo === null) {
                    continue;
                }
                account.name = accountInfo.Name;

            }

            return accounts;

        }

        // This just calls __GetActiveSupportAccountsIntent on an ec2, didn't know best practice to secure my credentials in Lambda so I did it this way
        request.get('http://54.226.20.93:8393/collection/work/active-support-accounts')
            .then(function (res) {
                const result = JSON.parse(res).data
                    , entitlements = Object.keys(result).reduce(entitlementReducer.bind({result}), 'The currently active support accounts are: ')
                    ;
                self.emit(':tell', entitlements);
            })
            .catch(function (e) {
                console.log(e);
                self.emit(':tell', 'There was an error retrieving active support contracts');
            });

    }

};
