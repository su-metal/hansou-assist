
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n');
  lines.forEach((line, index) => {
    if (index === 0 && line.charCodeAt(0) === 0xFEFF) line = line.slice(1);
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        envConfig[key] = value;
    }
  });
}

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig['SUPABASE_SERVICE_ROLE_KEY'] || envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Key not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const facilitiesData = [
    {
        name: 'イズモホール豊橋',
        area: '豊橋市',
        phone: '0532-55-1000',
        halls: [
            { name: 'メインホール', capacity: 200, has_waiting_room: true },
            { name: '家族葬ホール', capacity: 50, has_waiting_room: true }
        ]
    },
    {
        name: '豊川市斎場会館 永遠の森',
        area: '豊川市',
        phone: '0533-85-2121',
        halls: [
            { name: '第1式場', capacity: 100, has_waiting_room: true },
            { name: '第2式場', capacity: 80, has_waiting_room: true }
        ]
    },
    {
        name: '家族葬の結家 蒲郡宝町',
        area: '蒲郡市',
        phone: '0533-68-1111',
        halls: [
            { name: '絆ホール', capacity: 30, has_waiting_room: true }
        ]
    },
    {
        name: 'しんしろ斎苑',
        area: '新城市',
        phone: '0536-22-2211',
        halls: [
            { name: '大ホール', capacity: 150, has_waiting_room: true }
        ]
    },
    {
        name: 'イズモホール田原',
        area: '田原市',
        phone: '0531-23-1000',
        halls: [
            { name: '鳳凰の間', capacity: 120, has_waiting_room: true },
            { name: '瑞雲の間', capacity: 60, has_waiting_room: true }
        ]
    }
];

async function seedHalls() {
    console.log('東三河のホールの登録を開始します...');

    for (const f of facilitiesData) {
        console.log(`施設「${f.name}」を登録中...`);
        
        const { data: facility, error: fError } = await supabase
            .from('facilities')
            .insert({
                name: f.name,
                area: f.area,
                phone: f.phone,
                is_active: true
            })
            .select()
            .single();

        if (fError) {
            console.error(`施設「${f.name}」の登録に失敗しました:`, fError);
            continue;
        }

        for (const h of f.halls) {
            console.log(`  ホール「${h.name}」を登録中...`);
            const { error: hError } = await supabase
                .from('halls')
                .insert({
                    facility_id: facility.id,
                    name: h.name,
                    capacity: h.capacity,
                    has_waiting_room: h.has_waiting_room,
                    is_active: true
                });

            if (hError) {
                console.error(`  ホール「${h.name}」の登録に失敗しました:`, hError);
            }
        }
    }

    console.log('登録が完了しました。');
}

seedHalls();
