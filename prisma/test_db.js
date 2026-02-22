import http from 'http';

function get(path) {
    return new Promise((resolve, reject) => {
        const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'GET' }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    try {
        const health = await get('/api/health');
        console.log('HEALTH:', JSON.stringify(health.body, null, 2));

        const cats = await get('/api/categories');
        console.log('\nCATEGORIES:', JSON.stringify(cats.body, null, 2));

        const items = await get('/api/items');
        console.log('\nITEMS (count):', items.body.count, '| totalStockValue:', items.body.totalStockValue);
        items.body.data.forEach(i => console.log(` - [${i.sku}] ${i.name}  Stock: ${i.stock}`));

        const summary = await get('/api/transactions/summary');
        console.log('\nSUMMARY:', JSON.stringify(summary.body.data, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
