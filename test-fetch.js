require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testFetch() {
    const dateStr = '2026-03-01';
    
    console.log(`Fetching date: ${dateStr}`);
    const { data: cremationData, error } = await supabase
        .from('cremation_vacancies')
        .select('*')
        .eq('date', dateStr)
        .order('time');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Result:', cremationData);
    }
}

testFetch();
