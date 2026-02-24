const { syncCremationVacancies } = require('./src/lib/actions/cremation-vacancy')

async function test() {
    console.log('Starting sync...')
    const result = await syncCremationVacancies()
    console.log('Result:', result)
}

test()
