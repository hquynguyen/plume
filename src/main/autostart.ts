import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'plume.desktop')

export const autostartEnabled = (): boolean => existsSync(file)

export function setAutostart(on: boolean): void {
  if (!on) return rmSync(file, { force: true })
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(
    file,
    ['[Desktop Entry]', 'Type=Application', 'Name=Plume', `Exec="${app.getPath('exe')}" --hidden`, 'Icon=plume', 'X-GNOME-Autostart-enabled=true', ''].join('\n')
  )
}
