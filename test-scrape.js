const cheerio = require('cheerio');
fetch('https://saijyo6.seagulloffice.com/tobone/user/cremationvacancy?172872981&c=1&f=1&__SANE_MI__=v1-1').then(r => r.text()).then(html => {
    const $ = cheerio.load(html);
    
    const times = [];
    $('#head_tr th span').each((i, el) => {
        const time = $(el).text().trim();
        if (time) times.push(time);
    });
    console.log('Times:', times);
    
    const dates = [];
    $('#header tr td span').each((i, el) => {
        let dateText = $(el).text().trim();
        if (dateText) {
            const match = dateText.match(/(\d+)月(\d+)日/);
            if (match) {
                const currentYear = new Date().getFullYear();
                const month = match[1].padStart(2, '0');
                const day = match[2].padStart(2, '0');
                dates.push(`${currentYear}-${month}-${day}`);
            }
        }
    });
    console.log('Dates:', dates);
    
    let dataRowIdx = 0;
    const upsertData = [];
    $('.akiTable tbody tr').each((i, tr) => {
        if ($(tr).attr('id') === 'head_tr') return;
        if (dataRowIdx >= dates.length) return;
        
        const dateIdx = dataRowIdx;
        dataRowIdx++;
        
        $(tr).find('td').each((timeIdx, td) => {
            if (timeIdx >= times.length) return;
            
            const countText = $(td).find('a').text().trim() || $(td).text().trim();
            const count = parseInt(countText);
            
            if (!isNaN(count)) {
                upsertData.push({
                    date: dates[dateIdx],
                    time: times[timeIdx],
                    available_count: count
                });
            } else if (countText === '友引' || countText.includes('不可') || countText === '×') {
                upsertData.push({
                    date: dates[dateIdx],
                    time: times[timeIdx],
                    available_count: 0
                });
            }
        });
    });
    console.log('UpsertData Length:', upsertData.length);
});
