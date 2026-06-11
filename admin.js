// Supabase Credentials (DE Nova Reader app)
const SUPABASE_URL = "https://pxrwtywphszseecvrqpq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cnd0eXdwaHN6c2VlY3ZycXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjgxODksImV4cCI6MjA5NTA0NDE4OX0.0XlT4K61xjPtE_nmyXSlKciWtjc7WX9qXgiZ1rwBiXg";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const dashboardShell = document.getElementById('dashboard-shell');

// Authentication forms DOM
const formLogin = document.getElementById('form-login');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const formMfa = document.getElementById('form-mfa');
const mfaToken = document.getElementById('mfa-token');
const btnMfaBack = document.getElementById('btn-mfa-back');

// Sidebar Admin Details
const adminName = document.getElementById('admin-name');
const adminEmail = document.getElementById('admin-email');
const adminSidebarImg = document.getElementById('admin-sidebar-avatar-img');
const adminSidebarPlh = document.getElementById('admin-sidebar-avatar-placeholder');
const btnLogout = document.getElementById('btn-logout');

// Navigation & Panels
const navButtons = document.querySelectorAll('.nav-btn');
const panelSections = document.querySelectorAll('.panel-section');

// Selected upload file reference
let selectedReleaseFile = null;
let activeAdminSessionUser = null; 
let pendingMfaUser = null; // Store user details during authentication flow

// Setup Active Tab Polling Interval reference for Chat
let supportChatInterval = null;
let selectedTicketId = null;
let currentEnrollSecret = null; // Stores currently generated Base32 secret for MFA enroll

// 1. Toast Notification Helper
function showAdminToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `nova-toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    else if (type === 'error') icon = 'alert-octagon';

    toast.innerHTML = `
        <div class="w-7 h-7 rounded bg-white/5 flex items-center justify-center shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4 text-white"></i>
        </div>
        <div class="flex-1 min-w-0">
            <strong class="text-white block font-bold text-[10px] uppercase tracking-wider">${title}</strong>
            <span class="text-gray-400 mt-0.5 block leading-tight text-[10px]">${message}</span>
        </div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4500);
}

// Base32 key generator helper for MFA Enrollment
function generateRandomBase32Secret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

// 2. Auth State Controller
async function checkAdminSession() {
    if (!supabaseClient) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        verifyAdminAccess(session.user);
    } else {
        authOverlay.classList.remove('hidden');
        dashboardShell.classList.add('hidden');
    }
}

async function verifyAdminAccess(user) {
    try {
        const { data, error } = await supabaseClient
            .from('admin_users')
            .select('*')
            .eq('email', user.email)
            .single();

        if (error || !data) {
            showAdminToast("Access Denied", "Your account is not registered as an administrator.", "error");
            await supabaseClient.auth.signOut();
            authOverlay.classList.remove('hidden');
            dashboardShell.classList.add('hidden');
            return;
        }

        // Show Dashboard
        activeAdminSessionUser = user;
        authOverlay.classList.add('hidden');
        dashboardShell.classList.remove('hidden');

        adminName.textContent = user.user_metadata?.full_name || "Nova Admin";
        adminEmail.textContent = user.email;

        // Render profile picture if present
        if (data.avatar_url) {
            adminSidebarImg.src = data.avatar_url;
            adminSidebarImg.classList.remove('hidden');
            adminSidebarPlh.classList.add('hidden');
        } else {
            adminSidebarImg.classList.add('hidden');
            adminSidebarPlh.classList.remove('hidden');
            adminSidebarPlh.textContent = user.email.charAt(0).toUpperCase();
        }

        // Load dashboard info
        loadDashboardData();

    } catch (err) {
        console.error(err);
        showAdminToast("System Error", "Failed to verify admin status.", "error");
    }
}

// 3. Tab Panel Navigation
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetPanel = btn.getAttribute('data-panel');

        navButtons.forEach(n => n.className = "nav-btn flex items-center gap-3.5 w-full px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-left transition-all text-gray-400 hover:bg-white/5 hover:text-white");
        btn.className = "nav-btn active flex items-center gap-3.5 w-full px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-left transition-all text-nova-accent bg-nova-accent/10";

        // Stop support polling loop if leaving Support tab
        if (supportChatInterval) {
            clearInterval(supportChatInterval);
            supportChatInterval = null;
        }

        panelSections.forEach(sec => {
            if (sec.id === targetPanel) {
                sec.classList.remove('hidden');
                // Trigger reload of panel specific data
                if (targetPanel === 'panel-overview') loadDashboardData();
                else if (targetPanel === 'panel-users') loadUsersList();
                else if (targetPanel === 'panel-releases') loadReleasesList();
                else if (targetPanel === 'panel-broadcast') loadBroadcastsList();
                else if (targetPanel === 'panel-support') loadSupportTickets();
                else if (targetPanel === 'panel-setup') loadAdminSetupPanel();
            } else {
                sec.classList.add('hidden');
            }
        });
    });
});

// 4. Login Submission
if (formLogin) {
    formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const email = loginEmail.value.trim();
        const password = loginPassword.value;

        try {
            // First perform standard auth sign in
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // Check if user is an administrator
            const { data: adminRecord, error: adminErr } = await supabaseClient
                .from('admin_users')
                .select('*')
                .eq('email', email)
                .single();

            if (adminErr || !adminRecord) {
                showAdminToast("Access Denied", "Your account is not registered as an administrator.", "error");
                await supabaseClient.auth.signOut();
                return;
            }

            // Check if Admin has MFA TOTP devices configured
            const { data: mfaKeys, error: mfaErr } = await supabaseClient
                .from('admin_mfa')
                .select('*')
                .eq('admin_email', email);

            if (mfaErr) throw mfaErr;

            if (mfaKeys && mfaKeys.length > 0) {
                // MFA Required! Hide credentials form, show OTP token form
                pendingMfaUser = data.user;
                formLogin.classList.add('hidden');
                formMfa.classList.remove('hidden');
                mfaToken.value = "";
                mfaToken.focus();
                showAdminToast("MFA Required", "Authenticator verification token requested.", "info");
            } else {
                // No MFA configured: allow direct entry
                verifyAdminAccess(data.user);
            }

        } catch (err) {
            showAdminToast("Authentication Failed", err.message, "error");
        }
    };
}

// MFA Verification submit
if (formMfa) {
    formMfa.onsubmit = async (e) => {
        e.preventDefault();
        if (!pendingMfaUser) return;

        const codeInput = mfaToken.value.trim();
        if (codeInput.length !== 6) {
            showAdminToast("Invalid Format", "OTP code must be 6 digits.", "error");
            return;
        }

        try {
            // Retrieve MFA keys for pending user
            const { data: mfaKeys, error } = await supabaseClient
                .from('admin_mfa')
                .select('*')
                .eq('admin_email', pendingMfaUser.email);

            if (error) throw error;

            let validated = false;
            for (const key of mfaKeys) {
                // Verify using otpauth library
                const totp = new window.OTPAuth.TOTP({
                    issuer: 'DENova',
                    label: pendingMfaUser.email,
                    algorithm: 'SHA1',
                    digits: 6,
                    period: 30,
                    secret: key.secret_key
                });

                const delta = totp.validate({ token: codeInput, window: 1 });
                if (delta !== null) {
                    validated = true;
                    break;
                }
            }

            if (validated) {
                const user = pendingMfaUser;
                pendingMfaUser = null;
                formMfa.classList.add('hidden');
                formLogin.classList.remove('hidden');
                verifyAdminAccess(user);
            } else {
                showAdminToast("Verification Failed", "The code you entered is invalid. Please try again.", "error");
            }

        } catch (err) {
            showAdminToast("Verification Error", err.message, "error");
        }
    };

    btnMfaBack.onclick = async () => {
        pendingMfaUser = null;
        await supabaseClient.auth.signOut();
        formMfa.classList.add('hidden');
        formLogin.classList.remove('hidden');
    };
}

// 5. Logout
if (btnLogout) {
    btnLogout.onclick = async () => {
        await supabaseClient.auth.signOut();
        activeAdminSessionUser = null;
        showAdminToast("Signed Out", "You have logged out of the admin panel.", "info");
        authOverlay.classList.remove('hidden');
        dashboardShell.classList.add('hidden');
    };
}

// 6. Fetch Dashboard Overview Stats
async function loadDashboardData() {
    try {
        // Query Stats Counts
        const { count: usersCount } = await supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true });
        const { count: releasesCount } = await supabaseClient.from('app_releases').select('*', { count: 'exact', head: true });
        const { count: alertsCount } = await supabaseClient.from('system_notifications').select('*', { count: 'exact', head: true });
        
        // Advanced categorized metrics
        const { count: suspendedCount } = await supabaseClient.from('user_profiles').select('*', { count: 'exact', head: true }).eq('is_active', false);
        const { count: privateMessagesCount } = await supabaseClient.from('system_notifications').select('*', { count: 'exact', head: true }).not('recipient_id', 'is', null);
        const { count: openTicketsCount } = await supabaseClient.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open');
        const { count: resolvedTicketsCount } = await supabaseClient.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved');

        const activeCount = (usersCount || 0) - (suspendedCount || 0);

        document.getElementById('stat-total-users').textContent = usersCount || 0;
        document.getElementById('stat-active-profiles').textContent = activeCount >= 0 ? activeCount : 0;
        document.getElementById('stat-suspended-users').textContent = suspendedCount || 0;
        document.getElementById('stat-total-releases').textContent = releasesCount || 0;
        document.getElementById('stat-total-broadcasts').textContent = (alertsCount || 0) - (privateMessagesCount || 0);
        document.getElementById('stat-private-broadcasts').textContent = privateMessagesCount || 0;
        document.getElementById('stat-open-tickets').textContent = openTicketsCount || 0;
        document.getElementById('stat-resolved-tickets').textContent = resolvedTicketsCount || 0;

        // Query Admins List
        const { data: admins } = await supabaseClient
            .from('admin_users')
            .select('*')
            .order('created_at', { ascending: true });

        if (admins) {
            const { data: mfaList } = await supabaseClient.from('admin_mfa').select('admin_email');
            
            adminListBody.innerHTML = admins.map(adm => {
                const avatarImg = adm.avatar_url 
                    ? `<img class="w-6 h-6 rounded-full object-cover border border-nova-accent/20" src="${adm.avatar_url}">`
                    : `<div class="w-6 h-6 rounded-full bg-nova-accent/15 flex items-center justify-center font-bold text-nova-accent text-[9px] uppercase">${adm.email.charAt(0)}</div>`;
                
                const hasMfa = mfaList && mfaList.some(m => m.admin_email === adm.email);
                const mfaBadge = hasMfa 
                    ? `<span class="px-2 py-0.5 bg-nova-accent/10 border border-nova-accent/30 text-nova-accent rounded-full text-[8px] font-bold uppercase tracking-wider">MFA Enrolled</span>`
                    : `<span class="px-2 py-0.5 bg-white/5 border border-white/10 text-gray-500 rounded-full text-[8px] font-bold uppercase tracking-wider">Password Only</span>`;

                return `
                    <tr>
                        <td class="py-2.5">${avatarImg}</td>
                        <td class="py-2.5 font-semibold text-white">${adm.email}</td>
                        <td class="py-2.5 font-mono text-gray-500">${new Date(adm.created_at).toLocaleDateString()}</td>
                        <td class="py-2.5">${mfaBadge}</td>
                    </tr>
                `;
            }).join('');
        }

    } catch (err) {
        console.error("Dashboard stats error:", err);
    }
}

// 7. User Accounts List Panel
async function loadUsersList() {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;

    try {
        tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-500 font-bold uppercase tracking-wider">Fetching registered users profiles...</td></tr>`;

        const { data: profiles, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        if (!profiles || profiles.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-500 font-bold uppercase tracking-wider">No registered user profiles found.</td></tr>`;
            return;
        }

        // Generate rows.
        tableBody.innerHTML = profiles.map(p => {
            const dobVal = p.dob || '';
            const today = new Date();
            let age = -1;
            let isVerified = false;
            
            if (dobVal) {
                const birthDate = new Date(dobVal);
                age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                isVerified = age >= 18;
            }

            const badgeHtml = isVerified 
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-nova-accent/10 border border-nova-accent/30 text-nova-accent text-[9px] font-bold rounded-full uppercase tracking-wider"><i data-lucide="check-circle-2" class="w-3 h-3 text-nova-accent"></i> Verified</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[9px] font-bold rounded-full uppercase tracking-wider"><i data-lucide="user" class="w-3 h-3 text-blue-400"></i> Standard</span>`;

            const activeStatus = p.is_active !== false 
                ? `<span class="px-2 py-0.5 bg-green-500/10 border border-green-500/30 text-green-500 text-[8px] font-bold rounded-full uppercase tracking-wider">Active</span>`
                : `<span class="px-2 py-0.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[8px] font-bold rounded-full uppercase tracking-wider">Suspended</span>`;

            const updatedDate = p.updated_at ? new Date(p.updated_at).toLocaleString() : 'Never';
            
            // Suspended lock/unlock icon selection
            const toggleActiveIcon = p.is_active !== false ? 'shield-off' : 'shield';
            const toggleActiveTitle = p.is_active !== false ? 'Deactivate (Suspend)' : 'Reactivate';

            return `
                <tr>
                    <td class="p-4 font-bold text-white">${p.email || 'No Email'}</td>
                    <td class="p-4">${p.full_name || 'Not Set'}</td>
                    <td class="p-4 font-mono">${dobVal || 'Not Set'}</td>
                    <td class="p-4">${badgeHtml}</td>
                    <td class="p-4">${activeStatus}</td>
                    <td class="p-4 font-mono text-gray-500 text-[10px]">${updatedDate}</td>
                    <td class="p-4 text-right pr-6 shrink-0">
                        <div class="inline-flex gap-2">
                            <button onclick="openEditUserModal('${p.user_id}', '${p.full_name.replace(/'/g, "\\'")}', '${dobVal}')" class="p-1.5 hover:bg-white/5 border border-transparent hover:border-gray-800 rounded-lg text-gray-400 hover:text-white transition-all" title="Edit Profile Details">
                                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="toggleUserActiveStatus('${p.user_id}', ${p.is_active !== false})" class="p-1.5 hover:bg-white/5 border border-transparent hover:border-gray-800 rounded-lg ${p.is_active !== false ? 'text-orange-500/70 hover:text-orange-500' : 'text-green-500/70 hover:text-green-500'} transition-all" title="${toggleActiveTitle}">
                                <i data-lucide="${toggleActiveIcon}" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="openDirectMessageModal('${p.user_id}', '${p.email.replace(/'/g, "\\'")}')" class="p-1.5 hover:bg-white/5 border border-transparent hover:border-gray-800 rounded-lg text-blue-400 hover:text-blue-300 transition-all" title="Send Private Notification">
                                <i data-lucide="mail" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="deleteUserProfile('${p.user_id}')" class="p-1.5 hover:bg-white/5 border border-transparent hover:border-gray-800 rounded-lg text-red-500 hover:text-red-400 transition-all" title="Delete User Profile">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();

    } catch (err) {
        showAdminToast("Load Users Failed", err.message, "error");
    }
}

// Modals Trigger Handlers for User Panel
window.openEditUserModal = (userId, fullName, dob) => {
    document.getElementById('edit-user-id').value = userId;
    document.getElementById('edit-user-fullname').value = fullName;
    document.getElementById('edit-user-dob').value = dob;
    document.getElementById('modal-user-edit').classList.remove('hidden');
};

document.getElementById('btn-user-edit-close').onclick = () => {
    document.getElementById('modal-user-edit').classList.add('hidden');
};

document.getElementById('form-user-edit').onsubmit = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const fullName = document.getElementById('edit-user-fullname').value.trim();
    const dob = document.getElementById('edit-user-dob').value;

    try {
        const { error } = await supabaseClient
            .from('user_profiles')
            .update({
                full_name: fullName,
                dob: dob,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (error) throw error;

        showAdminToast("User Updated", `Successfully updated details for ${fullName}.`, "success");
        document.getElementById('modal-user-edit').classList.add('hidden');
        loadUsersList();
    } catch (err) {
        showAdminToast("Update Failed", err.message, "error");
    }
};

window.toggleUserActiveStatus = async (userId, isCurrentlyActive) => {
    const action = isCurrentlyActive ? "deactivate (suspend)" : "reactivate";
    if (!confirm(`Are you sure you want to ${action} this user account?`)) return;

    try {
        const { error } = await supabaseClient
            .from('user_profiles')
            .update({
                is_active: !isCurrentlyActive,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (error) throw error;

        showAdminToast("Status Updated", `User has been successfully ${isCurrentlyActive ? 'suspended' : 'activated'}.`, "success");
        loadUsersList();
    } catch (err) {
        showAdminToast("Action Failed", err.message, "error");
    }
};

window.deleteUserProfile = async (userId) => {
    if (!confirm("WARNING: This will permanently delete the user profile from Nova Reader storage. Continue?")) return;

    try {
        const { error } = await supabaseClient
            .from('user_profiles')
            .delete()
            .eq('user_id', userId);

        if (error) throw error;

        showAdminToast("User Deleted", "The reader profile was removed from database.", "success");
        loadUsersList();
    } catch (err) {
        showAdminToast("Deletion Failed", err.message, "error");
    }
};

// Export to CSV Function
const btnExportCsv = document.getElementById('btn-export-csv');
if (btnExportCsv) {
    btnExportCsv.onclick = async () => {
        try {
            const { data: profiles, error } = await supabaseClient.from('user_profiles').select('*').order('email');
            if (error) throw error;

            if (!profiles || profiles.length === 0) {
                showAdminToast("Export Failed", "No profiles found to export.", "error");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Email,Full Name,Date of Birth,Status,Updated At\n";

            profiles.forEach(p => {
                const status = p.is_active !== false ? "Active" : "Suspended";
                const row = `"${p.email || ''}","${p.full_name || ''}","${p.dob || ''}","${status}","${p.updated_at || ''}"`;
                csvContent += row + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `DENovaReader_Users_Export_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showAdminToast("Export Successful", "CSV user profile logs downloaded.", "success");
        } catch (err) {
            showAdminToast("CSV Export Failed", err.message, "error");
        }
    };
}

// User DM Modal triggers
window.openDirectMessageModal = (userId, email) => {
    document.getElementById('dm-user-id').value = userId;
    document.getElementById('dm-user-target').textContent = `Target Recipient: ${email}`;
    document.getElementById('modal-user-dm').classList.remove('hidden');
};

document.getElementById('btn-user-dm-close').onclick = () => {
    document.getElementById('modal-user-dm').classList.add('hidden');
};

document.getElementById('form-user-dm').onsubmit = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('dm-user-id').value;
    const title = document.getElementById('dm-title').value.trim();
    const type = document.getElementById('dm-type').value;
    const message = document.getElementById('dm-message').value.trim();

    try {
        const { error } = await supabaseClient
            .from('system_notifications')
            .insert({
                title,
                message,
                type,
                recipient_id: userId
            });

        if (error) throw error;

        showAdminToast("Message Dispatched", "Private direct notification has been sent successfully.", "success");
        document.getElementById('form-user-dm').reset();
        document.getElementById('modal-user-dm').classList.add('hidden');
    } catch (err) {
        showAdminToast("Message Failed", err.message, "error");
    }
};

// 8. Releases Panel File drop and Upload
if (releaseFileDrop) {
    releaseFileDrop.onclick = () => releaseFileInput.click();
    
    releaseFileInput.onchange = () => {
        if (releaseFileInput.files.length > 0) {
            selectedReleaseFile = releaseFileInput.files[0];
            releaseFileLabel.textContent = `Selected: ${selectedReleaseFile.name} (${(selectedReleaseFile.size / (1024*1024)).toFixed(2)} MB)`;
            releaseFileDrop.classList.add('border-nova-accent');
        }
    };

    releaseFileDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        releaseFileDrop.classList.add('bg-nova-accent/5');
    });

    releaseFileDrop.addEventListener('dragleave', () => {
        releaseFileDrop.classList.remove('bg-nova-accent/5');
    });

    releaseFileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        releaseFileDrop.classList.remove('bg-nova-accent/5');
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.exe')) {
                selectedReleaseFile = file;
                releaseFileLabel.textContent = `Selected: ${selectedReleaseFile.name} (${(selectedReleaseFile.size / (1024*1024)).toFixed(2)} MB)`;
                releaseFileDrop.classList.add('border-nova-accent');
            } else {
                showAdminToast("Invalid File", "Only Windows setup executables (.exe) are allowed.", "error");
            }
        }
    });
}

// AI Summaries / Title Generator trigger
const btnAiTitle = document.getElementById('btn-ai-title');
if (btnAiTitle) {
    btnAiTitle.onclick = () => {
        const text = releaseNotes.value.trim();
        if (!text) {
            showAdminToast("Input Required", "Please type bullet-point changelogs first to summarize.", "warning");
            return;
        }

        // Standard client-side heuristics parser
        const lower = text.toLowerCase();
        let traits = [];

        if (lower.includes('fix') || lower.includes('crash') || lower.includes('bug') || lower.includes('solve')) {
            traits.push('Stability Fixes');
        }
        if (lower.includes('sync') || lower.includes('cloud') || lower.includes('supabase') || lower.includes('load')) {
            traits.push('Cloud Sync');
        }
        if (lower.includes('dark') || lower.includes('theme') || lower.includes('ui') || lower.includes('visual') || lower.includes('layout')) {
            traits.push('Visual Polish');
        }
        if (lower.includes('tts') || lower.includes('read') || lower.includes('voice') || lower.includes('speak')) {
            traits.push('Speech Reader');
        }
        if (lower.includes('pdf') || lower.includes('split') || lower.includes('merge') || lower.includes('zoom')) {
            traits.push('Viewer Upgrade');
        }

        if (traits.length === 0) {
            traits.push('System Update');
        }

        const generatedTitle = traits.slice(0, 2).join(' & ') + " Optimization";
        releaseTitle.value = generatedTitle;
        showAdminToast("Title Generated", `Summarized release notes as: "${generatedTitle}"`, "success");
    };
}

// Publish Release Submission
if (formRelease) {
    formRelease.onsubmit = async (e) => {
        e.preventDefault();

        if (!selectedReleaseFile) {
            showAdminToast("Setup File Required", "Please drag & drop or select an installer .exe file first.", "error");
            return;
        }

        const version = releaseVersion.value.trim();
        const title = releaseTitle.value.trim();
        const notes = releaseNotes.value;
        const mandatory = releaseMandatory.checked;

        // Show Progress Bar
        releaseProgressCont.classList.remove('hidden');
        btnReleaseSubmit.disabled = true;
        btnReleaseSubmit.style.opacity = '0.5';

        try {
            // Upload to Supabase Storage bucket
            const fileName = `DENovaReader_Setup_v${version}.exe`;
            const fileKey = `${version}/${fileName}`;

            releaseStatusTxt.textContent = "Uploading setup binary to Supabase Storage...";
            releaseProgressBar.style.width = '20%';
            releaseProgressPct.textContent = '20%';

            const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('app-releases')
                .upload(fileKey, selectedReleaseFile, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            releaseProgressBar.style.width = '70%';
            releaseProgressPct.textContent = '70%';
            releaseStatusTxt.textContent = "Constructing release notes and database rows...";

            // Get Public URL
            const { data: { publicUrl } } = supabaseClient.storage
                .from('app-releases')
                .getPublicUrl(fileKey);

            // Save row to app_releases
            const { error: dbError } = await supabaseClient
                .from('app_releases')
                .insert({
                    version,
                    title,
                    release_notes: notes,
                    download_url: publicUrl,
                    is_mandatory: mandatory
                });

            if (dbError) throw dbError;

            releaseProgressBar.style.width = '100%';
            releaseProgressPct.textContent = '100%';
            releaseStatusTxt.textContent = "Version published successfully!";

            showAdminToast("Release Published", `DE Nova Reader v${version} has been successfully deployed.`, "success");

            // Reset form
            formRelease.reset();
            selectedReleaseFile = null;
            releaseFileLabel.textContent = "Drag & drop or click to select setup file";
            releaseFileDrop.classList.remove('border-nova-accent');
            
            setTimeout(() => {
                releaseProgressCont.classList.add('hidden');
                btnReleaseSubmit.disabled = false;
                btnReleaseSubmit.style.opacity = '1';
                loadReleasesList();
            }, 2000);

        } catch (err) {
            console.error(err);
            showAdminToast("Release Failed", err.message || "Failed to publish release.", "error");
            releaseProgressCont.classList.add('hidden');
            btnReleaseSubmit.disabled = false;
            btnReleaseSubmit.style.opacity = '1';
        }
    };
}

// Load Release History List
async function loadReleasesList() {
    if (!releasesList) return;

    try {
        releasesList.innerHTML = `<p class="text-[10px] text-gray-500 italic">Loading release files...</p>`;

        const { data: releases, error } = await supabaseClient
            .from('app_releases')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!releases || releases.length === 0) {
            releasesList.innerHTML = `<p class="text-[10px] text-gray-500 italic text-center py-4">No published releases found.</p>`;
            return;
        }

        releasesList.innerHTML = releases.map(r => {
            const badge = r.is_mandatory 
                ? `<span class="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-bold rounded-full uppercase tracking-wider">Mandatory</span>`
                : `<span class="px-2 py-0.5 bg-gray-500/10 border border-gray-500/20 text-gray-400 text-[8px] font-bold rounded-full uppercase tracking-wider">Optional</span>`;

            return `
                <div class="glass-panel border border-gray-900 rounded-xl p-4 space-y-2.5">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-white">v${r.version}</h4>
                            <span class="text-[10px] text-nova-accent font-semibold block mt-0.5">${r.title}</span>
                        </div>
                        ${badge}
                    </div>
                    <p class="text-[10px] text-gray-500 font-mono truncate" title="${r.download_url}">${r.download_url}</p>
                    <span class="text-[9px] text-gray-600 block">${new Date(r.created_at).toLocaleString()}</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
    }
}

// 9. Broadcast Notification Submission
if (formBroadcast) {
    formBroadcast.onsubmit = async (e) => {
        e.preventDefault();
        const title = broadcastTitle.value.trim();
        const message = broadcastMessage.value.trim();
        const type = document.querySelector('input[name="broadcast-type"]:checked').value;

        try {
            const { error } = await supabaseClient
                .from('system_notifications')
                .insert({ title, message, type });

            if (error) throw error;

            showAdminToast("Broadcast Sent", "Notification sent successfully to all users.", "success");
            
            formBroadcast.reset();
            document.querySelector('input[name="broadcast-type"][value="info"]').checked = true;

            loadBroadcastsList();
        } catch (err) {
            showAdminToast("Broadcast Failed", err.message, "error");
        }
    };
}

// Load Broadcasts Log History
async function loadBroadcastsList() {
    if (!broadcastsList) return;

    try {
        broadcastsList.innerHTML = `<p class="text-[10px] text-gray-500 italic">Loading broadcast logs...</p>`;

        const { data: alerts, error } = await supabaseClient
            .from('system_notifications')
            .select('*')
            .is('recipient_id', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!alerts || alerts.length === 0) {
            broadcastsList.innerHTML = `<p class="text-[10px] text-gray-500 italic text-center py-4">No broadcast logs found.</p>`;
            return;
        }

        const borderColors = {
            success: 'border-l-green-500',
            info: 'border-l-blue-500',
            warning: 'border-l-orange-500',
            error: 'border-l-red-500'
        };

        broadcastsList.innerHTML = alerts.map(a => `
            <div class="glass-panel border border-gray-900 border-l-2 ${borderColors[a.type] || 'border-l-gray-500'} rounded-xl p-3.5 space-y-1.5">
                <strong class="text-white block text-[10px] font-bold uppercase tracking-wider">${a.title}</strong>
                <p class="text-gray-400 text-[10px] leading-relaxed">${a.message}</p>
                <span class="text-[8px] text-gray-600 block font-mono">${new Date(a.created_at).toLocaleString()}</span>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
    }
}

// 10. Live Support Care Ticketing Controller (NEW)
async function loadSupportTickets() {
    const listCont = document.getElementById('support-tickets-list');
    const activeCount = document.getElementById('support-active-count');
    if (!listCont) return;

    try {
        const { data: tickets, error } = await supabaseClient
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const openCount = tickets ? tickets.filter(t => t.status === 'open').length : 0;
        activeCount.textContent = openCount;

        if (!tickets || tickets.length === 0) {
            listCont.innerHTML = `<p class="text-[10px] text-gray-500 italic text-center py-4">No tickets currently submitted.</p>`;
            return;
        }

        listCont.innerHTML = tickets.map(t => {
            const isSelected = t.id === selectedTicketId;
            const categoryColor = t.category === 'Bug Report' ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                               : t.category === 'Account Sync' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                               : t.category === 'Feedback' ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                               : 'bg-gray-500/10 text-gray-400 border border-gray-500/20';

            const statusDot = t.status === 'open' 
                ? `<span class="w-1.5 h-1.5 rounded-full bg-nova-accent animate-pulse shrink-0"></span>`
                : `<i data-lucide="check" class="w-3 h-3 text-gray-500 shrink-0"></i>`;

            return `
                <div onclick="selectSupportTicket('${t.id}')" class="glass-panel border rounded-xl p-3 cursor-pointer select-none transition-all flex flex-col gap-2 ${isSelected ? 'border-nova-accent/50 shadow-[0_0_12px_rgba(0,255,65,0.06)]' : 'border-gray-900 hover:border-gray-800'}">
                    <div class="flex justify-between items-center">
                        <span class="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${categoryColor}">${t.category}</span>
                        ${statusDot}
                    </div>
                    <strong class="text-white block text-[10px] truncate">${t.user_email}</strong>
                    <p class="text-gray-400 text-[10px] truncate leading-normal">${t.message}</p>
                    <span class="text-[8px] text-gray-600 block mt-0.5">${new Date(t.created_at).toLocaleString()}</span>
                </div>
            `;
        }).join('');

        lucide.createIcons();

        // Start real-time chat polling if a ticket is selected
        if (selectedTicketId && !supportChatInterval) {
            supportChatInterval = setInterval(pollSupportReplies, 4000);
        }

    } catch (err) {
        console.error("Failed to load support tickets:", err);
    }
}

window.selectSupportTicket = async (ticketId) => {
    selectedTicketId = ticketId;
    
    // Hide empty state, show panels
    document.getElementById('support-chat-empty-state').classList.add('hidden');
    document.getElementById('support-chat-header').classList.remove('hidden');
    document.getElementById('support-chat-messages').classList.remove('hidden');
    document.getElementById('support-chat-input-block').classList.remove('hidden');

    // Load ticket details
    try {
        const { data: ticket, error } = await supabaseClient
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (error) throw error;

        document.getElementById('chat-ticket-category').textContent = ticket.category;
        document.getElementById('chat-ticket-id').textContent = `TICKET #${ticket.id.slice(0,8).toUpperCase()}`;
        document.getElementById('chat-ticket-email').textContent = ticket.user_email;

        // Toggle status buttons
        const btnResolve = document.getElementById('btn-resolve-ticket');
        const btnReopen = document.getElementById('btn-reopen-ticket');
        if (ticket.status === 'open') {
            btnResolve.classList.remove('hidden');
            btnReopen.classList.add('hidden');
        } else {
            btnResolve.classList.add('hidden');
            btnReopen.classList.remove('hidden');
        }

        // Highlight selected ticket card instantly
        loadSupportTickets();
        
        // Reset chat container content
        document.getElementById('support-chat-messages').innerHTML = `<p class="text-[10px] text-gray-500 italic">Syncing message logs...</p>`;
        
        // Fetch and display replies
        pollSupportReplies();

    } catch (err) {
        showAdminToast("Chat Sync Failed", err.message, "error");
    }
};

async function pollSupportReplies() {
    if (!selectedTicketId) return;

    try {
        // First retrieve parent ticket message
        const { data: ticket } = await supabaseClient.from('support_tickets').select('*').eq('id', selectedTicketId).single();
        // Retrieve replies
        const { data: replies, error } = await supabaseClient
            .from('ticket_replies')
            .select('*')
            .eq('ticket_id', selectedTicketId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const chatBox = document.getElementById('support-chat-messages');
        if (!chatBox) return;

        let messagesHtml = '';

        // Add parent message first
        if (ticket) {
            messagesHtml += `
                <div class="flex flex-col items-start gap-1 max-w-[80%]">
                    <span class="text-[8px] text-nova-accent font-bold uppercase tracking-widest pl-1">Customer (${ticket.user_email})</span>
                    <div class="bg-white/5 border border-white/8 rounded-2xl px-4 py-2.5 text-xs text-white leading-relaxed">
                        ${ticket.message}
                    </div>
                    <span class="text-[8px] text-gray-600 block pl-1 mt-0.5">${new Date(ticket.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        }

        // Add thread replies
        replies.forEach(r => {
            const isAdmin = r.sender === 'admin';
            const alignment = isAdmin ? 'items-end ml-auto' : 'items-start';
            const colorClass = isAdmin ? 'bg-nova-accent text-black border border-nova-accent/20' : 'bg-white/5 text-white border border-white/8';
            const label = isAdmin ? 'Support Team' : `Customer`;
            const labelColor = isAdmin ? 'text-gray-400 text-right pr-1' : 'text-nova-accent pl-1';

            messagesHtml += `
                <div class="flex flex-col ${alignment} gap-1 max-w-[80%]">
                    <span class="text-[8px] ${labelColor} font-bold uppercase tracking-widest">${label}</span>
                    <div class="${colorClass} rounded-2xl px-4 py-2.5 text-xs leading-relaxed">
                        ${r.message}
                    </div>
                    <span class="text-[8px] text-gray-600 block px-1 mt-0.5">${new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        });

        // Store scroll location to auto-scroll if at bottom
        const shouldScroll = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 80;
        
        chatBox.innerHTML = messagesHtml;
        
        if (shouldScroll) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }

    } catch (err) {
        console.error("Replies poll error:", err);
    }
}

// Reply form submit handler
const formSupportReply = document.getElementById('form-support-reply');
if (formSupportReply) {
    formSupportReply.onsubmit = async (e) => {
        e.preventDefault();
        if (!selectedTicketId) return;

        const replyField = document.getElementById('support-reply-text');
        const message = replyField.value.trim();
        if (!message) return;

        try {
            const { error } = await supabaseClient
                .from('ticket_replies')
                .insert({
                    ticket_id: selectedTicketId,
                    sender: 'admin',
                    message: message
                });

            if (error) throw error;

            replyField.value = "";
            pollSupportReplies();
        } catch (err) {
            showAdminToast("Reply Dispatch Failed", err.message, "error");
        }
    };
}

// Mark ticket as resolved
const btnResolve = document.getElementById('btn-resolve-ticket');
const btnReopen = document.getElementById('btn-reopen-ticket');
if (btnResolve && btnReopen) {
    btnResolve.onclick = async () => {
        if (!selectedTicketId) return;
        try {
            const { error } = await supabaseClient
                .from('support_tickets')
                .update({ status: 'resolved' })
                .eq('id', selectedTicketId);

            if (error) throw error;

            showAdminToast("Ticket Resolved", "Support ticket status updated to resolved.", "success");
            selectSupportTicket(selectedTicketId);
        } catch (err) {
            showAdminToast("Failed to Resolve", err.message, "error");
        }
    };

    btnReopen.onclick = async () => {
        if (!selectedTicketId) return;
        try {
            const { error } = await supabaseClient
                .from('support_tickets')
                .update({ status: 'open' })
                .eq('id', selectedTicketId);

            if (error) throw error;

            showAdminToast("Ticket Re-Opened", "Support ticket re-opened and activated.", "success");
            selectSupportTicket(selectedTicketId);
        } catch (err) {
            showAdminToast("Failed to Re-Open", err.message, "error");
        }
    };
}

// 11. Admin Setup & Security Management (NEW)
async function loadAdminSetupPanel() {
    loadMfaDevicesList();
    loadSubAdminsList();
    
    // Set active admin avatar fields
    if (activeAdminSessionUser) {
        try {
            const { data, error } = await supabaseClient
                .from('admin_users')
                .select('avatar_url')
                .eq('email', activeAdminSessionUser.email)
                .single();

            if (data && data.avatar_url) {
                document.getElementById('admin-setup-avatar-img').src = data.avatar_url;
                document.getElementById('admin-setup-avatar-img').classList.remove('hidden');
                document.getElementById('admin-setup-avatar-placeholder-text').classList.add('hidden');
                document.getElementById('btn-admin-avatar-delete').classList.remove('hidden');
            } else {
                document.getElementById('admin-setup-avatar-img').classList.add('hidden');
                document.getElementById('admin-setup-avatar-placeholder-text').classList.remove('hidden');
                document.getElementById('admin-setup-avatar-placeholder-text').textContent = activeAdminSessionUser.email.charAt(0).toUpperCase();
                document.getElementById('btn-admin-avatar-delete').classList.add('hidden');
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// Sub-admin invites form
const formSubadmin = document.getElementById('form-subadmin');
if (formSubadmin) {
    formSubadmin.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('subadmin-email').value.trim();

        try {
            // Verify if exists already
            const { data: existing } = await supabaseClient
                .from('admin_users')
                .select('*')
                .eq('email', email);

            if (existing && existing.length > 0) {
                showAdminToast("Invite Failed", "This email is already an authorized administrator.", "warning");
                return;
            }

            const { error } = await supabaseClient
                .from('admin_users')
                .insert({ email });

            if (error) throw error;

            showAdminToast("Admin Authorized", `Sub-admin credentials authorized for ${email}.`, "success");
            document.getElementById('subadmin-email').value = "";
            loadSubAdminsList();
        } catch (err) {
            showAdminToast("Invite Failed", err.message, "error");
        }
    };
}

async function loadSubAdminsList() {
    // We already display admin list in dashboard overview. We can load them on Overview.
    loadDashboardData(); 
}

// Admin Avatar Image upload
const adminAvatarInput = document.getElementById('admin-avatar-input');
const btnAdminAvatarDelete = document.getElementById('btn-admin-avatar-delete');

if (adminAvatarInput) {
    adminAvatarInput.onchange = async () => {
        if (adminAvatarInput.files.length === 0 || !activeAdminSessionUser) return;
        const file = adminAvatarInput.files[0];

        if (file.size > 2 * 1024 * 1024) {
            showAdminToast("Size Error", "Avatar image must be smaller than 2MB.", "error");
            return;
        }

        showAdminToast("Uploading...", "Saving administrator profile picture.", "info");

        try {
            const filePath = `admins/${activeAdminSessionUser.email}.png`;
            
            // Upload setup files
            const { error: uploadError } = await supabaseClient.storage
                .from('avatars')
                .upload(filePath, file, {
                    upsert: true,
                    contentType: file.type
                });

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabaseClient.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const cacheBustedUrl = publicUrl + '?t=' + Date.now();

            // Save row to admin_users table
            const { error: dbError } = await supabaseClient
                .from('admin_users')
                .update({ avatar_url: publicUrl })
                .eq('email', activeAdminSessionUser.email);

            if (dbError) throw dbError;

            showAdminToast("Avatar Updated", "Your profile picture has been successfully updated.", "success");
            loadAdminSetupPanel();

        } catch (err) {
            showAdminToast("Upload Failed", err.message, "error");
        }
    };
}

if (btnAdminAvatarDelete) {
    btnAdminAvatarDelete.onclick = async () => {
        if (!activeAdminSessionUser) return;

        showAdminToast("Deleting...", "Removing profile picture.", "info");

        try {
            const filePath = `admins/${activeAdminSessionUser.email}.png`;

            // Delete storage file
            await supabaseClient.storage.from('avatars').remove([filePath]);

            // Clear url column
            const { error } = await supabaseClient
                .from('admin_users')
                .update({ avatar_url: null })
                .eq('email', activeAdminSessionUser.email);

            if (error) throw error;

            showAdminToast("Avatar Removed", "Your profile picture was deleted.", "success");
            loadAdminSetupPanel();
        } catch (err) {
            showAdminToast("Action Failed", err.message, "error");
        }
    };
}

// 12. MFA TOTP enrollment callbacks
const btnMfaToggle = document.getElementById('btn-mfa-enroll-toggle');
const mfaEnrollCard = document.getElementById('mfa-enrollment-card');
const btnMfaEnrollClose = document.getElementById('btn-mfa-enroll-close');
const formMfaEnroll = document.getElementById('form-mfa-enroll');

if (btnMfaToggle && mfaEnrollCard) {
    btnMfaToggle.onclick = () => {
        mfaEnrollCard.classList.remove('hidden');
        
        // Generate a new Base32 Secret
        currentEnrollSecret = generateRandomBase32Secret();
        document.getElementById('mfa-secret-display').textContent = currentEnrollSecret;

        // Build otpauth URI
        const label = activeAdminSessionUser ? activeAdminSessionUser.email : "admin@nova.com";
        const totpUri = `otpauth://totp/DENova:${label}?secret=${currentEnrollSecret}&issuer=DENova`;
        
        // Generate QR code URL
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpUri)}`;
        document.getElementById('mfa-qr-img').src = qrUrl;
    };
}

if (btnMfaEnrollClose) {
    btnMfaEnrollClose.onclick = () => {
        mfaEnrollCard.classList.add('hidden');
        currentEnrollSecret = null;
    };
}

if (formMfaEnroll) {
    formMfaEnroll.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentEnrollSecret || !activeAdminSessionUser) return;

        const deviceName = document.getElementById('mfa-device-name').value.trim();
        const verifyCode = document.getElementById('mfa-verify-token').value.trim();

        if (verifyCode.length !== 6) {
            showAdminToast("Validation Error", "Please enter a 6-digit verification code.", "error");
            return;
        }

        try {
            // Verify token using otpauth library
            const totp = new window.OTPAuth.TOTP({
                issuer: 'DENova',
                label: activeAdminSessionUser.email,
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: currentEnrollSecret
            });

            const delta = totp.validate({ token: verifyCode, window: 1 });
            if (delta === null) {
                showAdminToast("Verification Failed", "The code you entered is invalid. Try scanning again.", "error");
                return;
            }

            // Save key to admin_mfa table
            const { error } = await supabaseClient
                .from('admin_mfa')
                .insert({
                    admin_email: activeAdminSessionUser.email,
                    device_name: deviceName,
                    secret_key: currentEnrollSecret
                });

            if (error) throw error;

            showAdminToast("MFA Device Added", `Successfully registered "${deviceName}" authenticator app.`, "success");
            
            // Reset and hide form
            formMfaEnroll.reset();
            mfaEnrollCard.classList.add('hidden');
            currentEnrollSecret = null;
            loadMfaDevicesList();

        } catch (err) {
            showAdminToast("Enrollment Failed", err.message, "error");
        }
    };
}

async function loadMfaDevicesList() {
    const list = document.getElementById('mfa-devices-list');
    if (!list || !activeAdminSessionUser) return;

    try {
        const { data: keys, error } = await supabaseClient
            .from('admin_mfa')
            .select('*')
            .eq('admin_email', activeAdminSessionUser.email)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!keys || keys.length === 0) {
            list.innerHTML = `<p class="text-[10px] text-gray-500 italic text-center py-2">No authenticator apps enrolled. Password-only entry active.</p>`;
            return;
        }

        list.innerHTML = keys.map(k => `
            <div class="glass-panel border border-gray-900 rounded-xl p-3 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-nova-accent/10 text-nova-accent flex items-center justify-center">
                        <i data-lucide="smartphone" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <strong class="text-white block text-[10px] font-bold">${k.device_name}</strong>
                        <span class="text-[8px] text-gray-600 block font-mono">Enrolled: ${new Date(k.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <button onclick="removeMfaDevice('${k.id}', '${k.device_name.replace(/'/g, "\\'")}')" class="p-1.5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg text-red-500 transition-colors" title="De-authorize Authenticator app">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `).join('');

        lucide.createIcons();

    } catch (err) {
        console.error("MFA load error:", err);
    }
}

window.removeMfaDevice = async (deviceId, name) => {
    if (!confirm(`Are you sure you want to remove and de-authorize "${name}" authenticator app?`)) return;

    try {
        const { error } = await supabaseClient
            .from('admin_mfa')
            .delete()
            .eq('id', deviceId);

        if (error) throw error;

        showAdminToast("Device Removed", `Successfully deleted "${name}".`, "success");
        loadMfaDevicesList();
    } catch (err) {
        showAdminToast("Removal Failed", err.message, "error");
    }
};

// Initialize session check
checkAdminSession();
lucide.createIcons();
