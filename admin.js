// Supabase Credentials (DE Nova Reader app)
const SUPABASE_URL = "https://pxrwtywphszseecvrqpq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cnd0eXdwaHN6c2VlY3ZycXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjgxODksImV4cCI6MjA5NTA0NDE4OX0.0XlT4K61xjPtE_nmyXSlKciWtjc7WX9qXgiZ1rwBiXg";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const dashboardShell = document.getElementById('dashboard-shell');
const formLogin = document.getElementById('form-login');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');

const adminName = document.getElementById('admin-name');
const adminEmail = document.getElementById('admin-email');
const btnLogout = document.getElementById('btn-logout');

const navButtons = document.querySelectorAll('.nav-btn');
const panelSections = document.querySelectorAll('.panel-section');

// Stats DOM
const statUsers = document.getElementById('stat-total-users');
const statReleases = document.getElementById('stat-total-releases');
const statBroadcasts = document.getElementById('stat-total-broadcasts');
const adminListBody = document.getElementById('admin-list-body');

// Form Releases DOM
const formRelease = document.getElementById('form-release');
const releaseVersion = document.getElementById('release-version');
const releaseTitle = document.getElementById('release-title');
const releaseNotes = document.getElementById('release-notes');
const releaseMandatory = document.getElementById('release-mandatory');
const releaseFileDrop = document.getElementById('release-file-drop');
const releaseFileInput = document.getElementById('release-file-input');
const releaseFileLabel = document.getElementById('release-file-label');
const releaseProgressCont = document.getElementById('release-progress-container');
const releaseProgressBar = document.getElementById('release-progress-bar');
const releaseProgressPct = document.getElementById('release-progress-percent');
const releaseStatusTxt = document.getElementById('release-status-text');
const btnReleaseSubmit = document.getElementById('btn-release-submit');
const releasesList = document.getElementById('releases-list');

// Form Broadcast DOM
const formBroadcast = document.getElementById('form-broadcast');
const broadcastTitle = document.getElementById('broadcast-title');
const broadcastMessage = document.getElementById('broadcast-message');
const broadcastsList = document.getElementById('broadcasts-list');

// Selected upload file reference
let selectedReleaseFile = null;

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
            <i data-lucide="${icon}" class="w-4 h-4"></i>
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
            // Logout if not in admin list
            showAdminToast("Access Denied", "Your account is not registered as an administrator.", "error");
            await supabaseClient.auth.signOut();
            authOverlay.classList.remove('hidden');
            dashboardShell.classList.add('hidden');
            return;
        }

        // Show Dashboard
        authOverlay.classList.add('hidden');
        dashboardShell.classList.remove('hidden');

        adminName.textContent = user.user_metadata?.full_name || "Nova Admin";
        adminEmail.textContent = user.email;

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

        panelSections.forEach(sec => {
            if (sec.id === targetPanel) {
                sec.classList.remove('hidden');
                // Trigger reload of panel specific data
                if (targetPanel === 'panel-overview') loadDashboardData();
                else if (targetPanel === 'panel-users') loadUsersList();
                else if (targetPanel === 'panel-releases') loadReleasesList();
                else if (targetPanel === 'panel-broadcast') loadBroadcastsList();
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
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;

            verifyAdminAccess(data.user);
        } catch (err) {
            showAdminToast("Authentication Failed", err.message, "error");
        }
    };
}

// 5. Logout
if (btnLogout) {
    btnLogout.onclick = async () => {
        await supabaseClient.auth.signOut();
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

        statUsers.textContent = usersCount || 0;
        statReleases.textContent = releasesCount || 0;
        statBroadcasts.textContent = alertsCount || 0;

        // Query Admins List
        const { data: admins } = await supabaseClient
            .from('admin_users')
            .select('*')
            .order('created_at', { ascending: true });

        if (admins) {
            adminListBody.innerHTML = admins.map(adm => `
                <tr>
                    <td class="py-3 font-semibold text-white">${adm.email}</td>
                    <td class="py-3 font-mono">${new Date(adm.created_at).toLocaleDateString()}</td>
                    <td class="py-3"><span class="px-2 py-0.5 bg-nova-accent/10 border border-nova-accent/30 text-nova-accent rounded-full text-[9px] font-bold uppercase tracking-wider">Super Administrator</span></td>
                </tr>
            `).join('');
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
        tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 font-bold uppercase tracking-wider">Fetching registered users profiles...</td></tr>`;

        const { data: profiles, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        if (!profiles || profiles.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 font-bold uppercase tracking-wider">No registered user profiles found.</td></tr>`;
            return;
        }

        // Generate rows. We verify by calculateAge(dob) >= 18.
        tableBody.innerHTML = profiles.map(p => {
            const dobVal = p.dob || '';
            const today = new Date();
            let isVerified = false;
            
            if (dobVal) {
                const birthDate = new Date(dobVal);
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                isVerified = age >= 18;
            }

            const updatedDate = p.updated_at ? new Date(p.updated_at).toLocaleString() : 'Never';

            return `
                <tr>
                    <td class="p-4 font-bold text-white">${p.email || 'Unknown User'}</td>
                    <td class="p-4">${p.full_name || 'Not Set'}</td>
                    <td class="p-4 font-mono">${dobVal || 'Not Set'}</td>
                    <td class="p-4">
                        <label class="switch">
                            <input type="checkbox" ${isVerified ? 'checked' : ''} onchange="toggleUserVerification('${p.user_id}', ${isVerified})">
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td class="p-4 font-mono text-gray-500 text-[10px]">${updatedDate}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        showAdminToast("Load Users Failed", err.message, "error");
    }
}

// Toggle Verification Switch by altering DOB to verify/unverify
window.toggleUserVerification = async (userId, isCurrentlyVerified) => {
    try {
        // Set dob to 2000-01-01 (18+ verified) or 2015-01-01 (standard)
        const targetDob = isCurrentlyVerified ? '2015-01-01' : '2000-01-01';

        const { error } = await supabaseClient
            .from('user_profiles')
            .update({ 
                dob: targetDob,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (error) throw error;

        showAdminToast("User Updated", `Successfully toggled reader badge status.`, "success");
        loadUsersList();
    } catch (err) {
        showAdminToast("Action Failed", err.message, "error");
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
            // Reselect default radio info
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

// Initialize session check
checkAdminSession();
lucide.createIcons();
