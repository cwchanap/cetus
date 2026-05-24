import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const loginPath = resolve(process.cwd(), 'src/pages/login/index.astro')
const signupPath = resolve(process.cwd(), 'src/pages/signup/index.astro')

const loginMarkup = readFileSync(loginPath, 'utf-8')
const signupMarkup = readFileSync(signupPath, 'utf-8')

describe('Auth pages', () => {
    it('keeps the login page Google-only', () => {
        const googleCtas =
            loginMarkup.match(/<button[\s\S]*?data-social="google"/g) ?? []

        expect(loginMarkup).toContain('data-social="google"')
        expect(googleCtas).toHaveLength(1)
        expect(loginMarkup).toContain('Continue with Google')
        expect(loginMarkup).toContain("provider: 'google'")
        expect(loginMarkup).toContain("callbackURL: '/?redirect=games'")

        expect(loginMarkup).not.toContain('id="login-form"')
        expect(loginMarkup).not.toContain('type="email"')
        expect(loginMarkup).not.toContain('type="password"')
        expect(loginMarkup).not.toContain('authClient.signIn.email')
        expect(loginMarkup).not.toContain('Forgot password')
        expect(loginMarkup).not.toContain('Remember me')
    })

    it('keeps the signup page Google-only', () => {
        const googleCtas =
            signupMarkup.match(/<button[\s\S]*?data-social="google"/g) ?? []

        expect(signupMarkup).toContain('data-social="google"')
        expect(googleCtas).toHaveLength(1)
        expect(signupMarkup).toContain('Create account with Google')
        expect(signupMarkup).toContain("provider: 'google'")
        expect(signupMarkup).toContain("callbackURL: '/'")

        expect(signupMarkup).not.toContain('id="signup-form"')
        expect(signupMarkup).not.toContain('type="email"')
        expect(signupMarkup).not.toContain('type="password"')
        expect(signupMarkup).not.toContain('authClient.signUp.email')
        expect(signupMarkup).not.toContain('id="terms"')
    })
})
