const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n');
  lines.forEach((line) => {
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        envConfig[key] = value;
    }
  });
}

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Key not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateHours() {
    console.log('すべての斎場の営業時間を22:00までに更新します...');
    
    const { data, error } = await supabase
        .from('facilities')
        .update({ end_hour: 22 })
        .not('id', 'is', null); // Update all

    if (error) {
        console.error('更新に失敗しました:', error);
    } else {
        console.log('更新が完了しました。');
    }
}

updateHours();
