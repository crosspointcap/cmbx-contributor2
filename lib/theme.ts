import { createClient } from '@supabase/supabase-js'

export interface Theme {
  bg:     string   // main background      default #0a0a0a
  fg:     string   // main text            default #cccccc
  accent: string   // amber accent         default #f0c040
  bid:    string   // bid / buy colour     default #66ff88
  ask:    string   // ask / sell colour    default #ff6666
}

export const DEFAULT_THEME: Theme = {
  bg:     '#0a0a0a',
  fg:     '#cccccc',
  accent: '#f0c040',
  bid:    '#66ff88',
  ask:    '#ff6666',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Load theme for the currently authenticated user.
 *  Returns DEFAULT_THEME if no session or no saved theme. */
export async function loadTheme(): Promise<Theme> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return DEFAULT_THEME
    const { data } = await supabase
      .from('profiles')
      .select('theme')
      .eq('id', session.user.id)
      .single()
    if (data?.theme && typeof data.theme === 'object') {
      return { ...DEFAULT_THEME, ...data.theme } as Theme
    }
  } catch {}
  return DEFAULT_THEME
}

/** Persist theme for the currently authenticated user. */
export async function saveTheme(theme: Theme): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase
      .from('profiles')
      .update({ theme })
      .eq('id', session.user.id)
  } catch {}
}
