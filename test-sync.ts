import * as cheerio from 'cheerio'

const CREMATION_URL = 'https://saijyo6.seagulloffice.com/tobone/user/cremationvacancy?172872981&c=1&f=1&__SANE_MI__=v1-1'

async function testSync() {
    console.log('Fetching:', CREMATION_URL)
    const response = await fetch(CREMATION_URL, { cache: 'no-store' })
    const html = await response.text()
    const $ = cheerio.load(html)
    
    const times: string[] = []
    $('#head_tr th span').each((i, el) => {
        const time = $(el).text().trim()
        if (time) times.push(time)
    })
    console.log('Parsed Times:', times)
    
    const dates: string[] = []
    $('#header tr td span').each((i, el) => {
        let dateText = $(el).text().trim()
        if (dateText) {
            const match = dateText.match(/(\d+)月(\d+)日/)
            if (match) {
                dates.push(`${match[1]}/${match[2]}`)
            }
        }
    })
    console.log('Parsed Dates:', dates)
    
    let count = 0
    $('.akiTable tr').each((i, tr) => {
        // Skip header row
        if ($(tr).attr('id') === 'head_tr') return
        
        // This should match the corresponding date index
        // But what if there are other rows? Let's just log the first data row
        if (count === 0) {
            console.log('First data row HTML:', $(tr).html())
            const tds = $(tr).find('td')
            console.log(`Found ${tds.length} tds in first data row.`)
        }
        count++
    })
    console.log(`Total data rows: ${count}`)
}

testSync().catch(console.error)
