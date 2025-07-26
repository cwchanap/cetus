import { Page, Locator } from '@playwright/test'

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
    readonly usernameInput: Locator
    readonly passwordInput: Locator
    readonly rememberMeCheckbox: Locator
    readonly loginSubmitButton: Locator
    readonly googleLoginButton: Locator
    readonly forgotPasswordLink: Locator
    readonly signUpLink: Locator

    constructor(page: Page) {
        super(page)
        this.pageTitle = page.getByRole('heading', { name: 'PLAYER LOGIN' })
        this.usernameInput = page.getByRole('textbox', {
            name: 'Enter your username or email',
        })
        this.passwordInput = page.getByRole('textbox', { name: 'Password' })
        this.rememberMeCheckbox = page.getByRole('checkbox', {
            name: 'Remember me',
        })
        this.loginSubmitButton = page.getByRole('button', {
            name: '🚀 Login to Play',
        })
        this.googleLoginButton = page.getByRole('button', {
            name: '🌐 Continue with Google',
        })
        this.forgotPasswordLink = page.getByRole('link', {
            name: 'Forgot password?',
        })
        this.signUpLink = page.getByRole('link', { name: 'Sign up here' })
    }

    async goto() {
        await this.page.goto('/login')
    }

    async fillCredentials(username: string, password: string) {
        await this.usernameInput.fill(username)
        await this.passwordInput.fill(password)
    }

    async toggleRememberMe() {
        await this.rememberMeCheckbox.check()
    }

    async submitLogin() {
        await this.loginSubmitButton.click()
    }

    async navigateToSignup() {
        await this.signUpLink.click()
    }

    async navigateToForgotPassword() {
        await this.forgotPasswordLink.click()
    }

    async loginWithGoogle() {
        await this.googleLoginButton.click()
    }
}

export class SignupPage extends AuthPage {
    readonly pageTitle: Locator
    readonly emailInput: Locator
    readonly passwordInput: Locator
    readonly confirmPasswordInput: Locator
    readonly termsCheckbox: Locator
    readonly createAccountButton: Locator
    readonly googleSignupButton: Locator
    readonly termsOfServiceLink: Locator
    readonly privacyPolicyLink: Locator
    readonly signInLink: Locator

    constructor(page: Page) {
        super(page)
        this.pageTitle = page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        this.emailInput = page.getByRole('textbox', { name: 'Email Address' })
        this.passwordInput = page.getByRole('textbox', { name: 'Password' })
        this.confirmPasswordInput = page.getByRole('textbox', {
            name: 'Confirm Password',
        })
        this.termsCheckbox = page.getByRole('checkbox', {
            name: 'I agree to the Terms of Service and Privacy Policy',
        })
        this.createAccountButton = page.getByRole('button', {
            name: '🚀 Create Account',
        })
        this.googleSignupButton = page.getByRole('button', {
            name: '🌐 Sign up with Google',
        })
        this.termsOfServiceLink = page.getByRole('link', {
            name: 'Terms of Service',
        })
        this.privacyPolicyLink = page.getByRole('link', {
            name: 'Privacy Policy',
        })
        this.signInLink = page.getByRole('link', { name: 'Sign in here' })
    }

    async goto() {
        await this.page.goto('/signup')
    }

    async fillRegistrationForm(
        email: string,
        password: string,
        confirmPassword: string
    ) {
        await this.emailInput.fill(email)
        await this.passwordInput.fill(password)
        await this.confirmPasswordInput.fill(confirmPassword)
    }

    async acceptTerms() {
        await this.termsCheckbox.check()
    }

    async submitSignup() {
        await this.createAccountButton.click()
    }

    async navigateToLogin() {
        await this.signInLink.click()
    }

    async signupWithGoogle() {
        await this.googleSignupButton.click()
    }
}
