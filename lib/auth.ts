import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export function generateResetToken(): string {
  return randomBytes(32).toString('hex')
}

export function getResetTokenExpiry(): Date {
  const expiry = new Date()
  expiry.setHours(expiry.getHours() + 1) // Token expires in 1 hour
  return expiry
}
