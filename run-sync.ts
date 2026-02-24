import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

import { syncCremationVacancies } from './src/lib/actions/cremation-vacancy'

async function test() {
    console.log('Running sync...')
    const res = await syncCremationVacancies()
    console.log('Result:', res)
    
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { data, error } = await supabase.from('cremation_vacancies').select('*').limit(5)
    if (error) console.error('DB Error:', error)
    console.log('Sample data from DB:', data)
}

test().catch(console.error)
