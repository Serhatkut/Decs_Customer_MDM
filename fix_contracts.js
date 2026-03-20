const fs = require('fs');
const filePath = 'data/customerData.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let matchCount = 0;

function traverse(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(traverse);
    } else if (obj !== null && typeof obj === 'object') {
        if (Array.isArray(obj.contracts)) {
            obj.contracts.forEach((contract) => {
                if (!contract.rateCards || contract.rateCards.length === 0) {
                    contract.rateCards = [
                        {
                            "rateCardId": "RATE CARD",
                            "pricePolicyId": "STD-2026",
                            "usedTariffIds": ["TRF-DOM", "TRF-INTL"]
                        }
                    ];
                    matchCount++;
                }
            });
        }
        for (const key in obj) {
            traverse(obj[key]);
        }
    }
}

traverse(data);
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Successfully injected rate cards into ${matchCount} contracts.`);
