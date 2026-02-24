const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n');
  lines.forEach((line) => {
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
        envConfig[match[1].trim()] = match[2].trim();
    }
  });
}

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function forceUpdate() {
    console.log('Attempting to update all facilities to 22:00...');
    
    // First, let's get all IDs
    const { data: facilities, error: fetchError } = await supabase.from('facilities').select('id');
    if (fetchError) {
        console.error('Fetch Error:', fetchError);
        return;
    }
    
    console.log(`Found ${facilities.length} facilities.`);
    
    for (const f of facilities) {
        const { error: updateError } = await supabase
            .from('facilities')
            .update({ end_hour: 22 })
            .eq('id', f.id);
            
        if (updateError) {
            console.error(`Failed to update ${f.id}:`, updateError);
        } else {
            console.log(`Successfully updated ${f.id}`);
        }
    }
}

forceUpdate();
