'use server'

import * as cheerio from 'cheerio'
import { createClient } from '@/lib/supabase/server'
import { format, parse } from 'date-fns'
import { ja } from 'date-fns/locale'

const CREMATION_URL = 'https://saijyo6.seagulloffice.com/tobone/user/cremationvacancy?172872981&c=1&f=1&__SANE_MI__=v1-1'

export async function syncCremationVacancies() {
    try {
        const response = await fetch(CREMATION_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to fetch cremation vacancy page')
        
        const html = await response.text()
        const $ = cheerio.load(html)
        
        const supabase = await createClient()
        
        // Extract times from header
        const times: string[] = []
        $('#head_tr th span').each((i, el) => {
            const time = $(el).text().trim()
            if (time) times.push(time)
        })
        
        // Extract dates
        const dates: string[] = []
        $('#header tr td span').each((i, el) => {
            let dateText = $(el).text().trim()
            if (dateText) {
                // Formatting: "2月26日(木)仏滅" -> extract "2月26日"
                // Assuming current year
                const match = dateText.match(/(\d+)月(\d+)日/)
                if (match) {
                    const currentYear = new Date().getFullYear()
                    const month = match[1].padStart(2, '0')
                    const day = match[2].padStart(2, '0')
                    dates.push(`${currentYear}-${month}-${day}`)
                }
            }
        })
        
        const upsertData: { date: string, time: string, available_count: number }[] = []
        
        // Extract vacancy counts
        let dataRowIdx = 0
        $('.akiTable tbody tr').each((i, tr) => {
            if ($(tr).attr('id') === 'head_tr') return
            if (dataRowIdx >= dates.length) return
            
            const dateIdx = dataRowIdx
            dataRowIdx++
            
            $(tr).find('td').each((timeIdx, td) => {
                if (timeIdx >= times.length) return
                
                const countText = $(td).find('a').text().trim() || $(td).text().trim()
                const count = parseInt(countText)
                
                if (!isNaN(count)) {
                    upsertData.push({
                        date: dates[dateIdx],
                        time: times[timeIdx],
                        available_count: count
                    })
                } else if (countText === '友引' || countText.includes('不可') || countText === '×') {
                    upsertData.push({
                        date: dates[dateIdx],
                        time: times[timeIdx],
                        available_count: 0
                    })
                }
            })
        })
        
        if (upsertData.length > 0) {
            const { error } = await supabase
                .from('cremation_vacancies')
                .upsert(upsertData, { onConflict: 'date,time' })
            
            if (error) throw error
        }
        
        return { success: true, count: upsertData.length }
    } catch (error) {
        console.error('Error syncing cremation vacancies:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}
