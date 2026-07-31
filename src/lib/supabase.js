// Supabase 客户端 —— 整个项目与后端（数据库、登录系统）通信的唯一入口
// 其他文件只要 import { supabase } from './lib/supabase' 就能用
import { createClient } from '@supabase/supabase-js'

// import.meta.env 会读取 .env.local 里以 VITE_ 开头的变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
