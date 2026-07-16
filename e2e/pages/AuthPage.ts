import { type Page, type Locator } from '@playwright/test'

export class AuthPage {
    readonly page: Page
    readonly navigation: Locator
    readonly logo: Locator
    readonly loginButton: Locator
    readonly footer: Locator

    constructor(page: Page) {
        this.page = page
        this.navigation = page.locator('nav')
        this.logo = page.getByRole('link', { name: 'C CETUS' })
        this.loginButton = page.getByRole('button', { name: 'Login' })
        this.footer = page.locator('footer')
    }

    async navigateToHome() {
        await this.logo.click()
    }
}

export class LoginPage extends AuthPage {
    readonly pageTitle: Locator
    readonly googleLoginButton: Locator
    readonly signUpLink: Locator

    constructor(page: Page) {
        super(page)
        this.pageTitle = page.getByRole('heading', { name: 'PLAYER LOGIN' })
        this.googleLoginButton = page.getByRole('button', {
            name: /continue with google/i,
        })
        this.signUpLink = page.getByRole('link', {
            name: 'Create one with Google',
        })
    }

    async goto() {
        await this.page.goto('/login')
    }

    async navigateToSignup() {
        await this.signUpLink.click()
    }

    async loginWithGoogle() {
        await this.googleLoginButton.click()
    }
}

export class SignupPage extends AuthPage {
    readonly pageTitle: Locator
    readonly googleSignupButton: Locator
    readonly signInLink: Locator

    constructor(page: Page) {
        super(page)
        this.pageTitle = page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        this.googleSignupButton = page.getByRole('button', {
            name: /create account with google/i,
        })
        this.signInLink = page.getByRole('link', {
            name: 'Continue with Google',
        })
    }

    async goto() {
        await this.page.goto('/signup')
    }

    async navigateToLogin() {
        await this.signInLink.click()
    }

    async signupWithGoogle() {
        await this.googleSignupButton.click()
    }
}
