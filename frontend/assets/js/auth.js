// ==================== DataBot Authentication Logic ====================
const authClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const Auth = {
    isSignUp: false,

    init() {
        this.cacheElements();
        this.bindEvents();
        this.checkSession();
    },

    cacheElements() {
        this.form = document.getElementById('auth-form');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.fullNameInput = document.getElementById('full_name');
        this.nameGroup = document.getElementById('name-group');
        this.submitBtn = document.getElementById('btn-submit');
        this.switchBtn = document.getElementById('switch-auth');
        this.errorMsg = document.getElementById('auth-error');
        this.authTitle = document.getElementById('auth-title');
        this.switchText = document.getElementById('switch-text');
        this.demoBtn = document.getElementById('btn-demo');
    },

    bindEvents() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.switchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleMode();
        });
        if (this.demoBtn) {
            this.demoBtn.addEventListener('click', () => this.demoLogin());
        }
    },

    async checkSession() {
        const { data: { session } } = await authClient.auth.getSession();
        if (session) {
            window.location.href = 'index.html';
        }
    },

    toggleMode() {
        this.isSignUp = !this.isSignUp;
        this.nameGroup.style.display = this.isSignUp ? 'block' : 'none';
        this.authTitle.textContent = this.isSignUp ? 'Buat Akun Baru' : 'Selamat Datang Kembali';
        this.submitBtn.textContent = this.isSignUp ? 'Daftar' : 'Login';
        this.switchText.textContent = this.isSignUp ? 'Sudah punya akun?' : 'Belum punya akun?';
        this.switchBtn.textContent = this.isSignUp ? 'Login Sekarang' : 'Daftar Sekarang';
        this.fullNameInput.required = this.isSignUp;
        this.errorMsg.style.display = 'none';
    },

    async handleSubmit(e) {
        e.preventDefault();
        this.errorMsg.style.display = 'none';
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = 'Memproses...';

        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        const fullName = this.fullNameInput.value;

        try {
            let result;
            if (this.isSignUp) {
                result = await authClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName }
                    }
                });
            } else {
                result = await authClient.auth.signInWithPassword({ email, password });
            }

            if (result.error) throw result.error;

            if (this.isSignUp && !result.data.session) {
                this.showError('Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi.');
            } else {
                window.location.href = 'index.html';
            }
        } catch (err) {
            this.showError(err.message);
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = this.isSignUp ? 'Daftar' : 'Login';
        }
    },

    async demoLogin() {
        // Switch to login mode if in signup mode
        if (this.isSignUp) this.toggleMode();
        
        this.emailInput.value = 'wahyu@yopmail.com';
        this.passwordInput.value = 'wahyu123';
        this.errorMsg.style.display = 'none';
        this.demoBtn.disabled = true;
        this.demoBtn.textContent = 'Menghubungkan...';

        try {
            const result = await authClient.auth.signInWithPassword({
                email: 'wahyu@yopmail.com',
                password: 'wahyu123'
            });
            if (result.error) throw result.error;
            window.location.href = 'index.html';
        } catch (err) {
            this.showError('Demo login gagal: ' + err.message);
            this.demoBtn.disabled = false;
            this.demoBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Coba Bot (Demo)';
        }
    },

    showError(msg) {
        this.errorMsg.textContent = msg;
        this.errorMsg.style.display = 'block';
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());
