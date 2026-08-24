// --- DUEVINCI APPLICATION ENTRY POINT ---

import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './modules/config.js';
import { getCurrentPageName, smartParseDate, parseInputDate, fireConfetti, recordStudyActivity, playTimerAlarm, toggleAmbientNoise, speakText, getTourCookie, setTourCookie, getBasePath } from './modules/utils.js';
import { currentUser, checkUser, handleAuth, showAuthMessage, signInWithEmail, signInWithGoogle, signUpWithEmail, logout, initPasskeyUI, signInWithPasskey, registerPasskey } from './modules/auth.js';
import { calculateStudyStreak, calculateDaysRemaining, getWorkloadIntensity, calculateCumulativeGpa, renderAcademicsDashboardWidget, injectAcademicsSettingsToggle, toggleAcademicsVisibility } from './modules/academics.js';
import { createTimerState, stepTimerState, formatTimerTime, activeTimers, addNewTimer, deleteTimer, resetMultiTimer, toggleMultiTimerRun, initMultiTimersUI, renderTimersManager, toggleTimer, resetTimer, skipTimer, toggleTimerSettings, saveTimerSettings, setTimerDuration, toggleTimerCollapse, toggleCustomTimersSection, dismissFloatingTimer, updateTimerDisplay, updateFloatingTimer, applyTimerCollapse } from './modules/timers.js';
import { localCourses, loadDashboardStats, loadCoursesPage, initCourseForm, renderTermFolders, renderAlphabeticals, openCourseModal, closeCourseModal, openTermModal, closeTermModal, loadAssignments, toggleAssignment, updateAssignmentDate, updateAssignmentPriority, updateAssignmentType, updateAssignmentTitle, editAssignmentTitlePrompt, deleteAssignment, submitAddAssignment, addSubItem, changeAssignmentPage, updateScratchpadPreview, downloadCourseNotesAsMarkdown, filterDashboardUpNext, openQuickAddModal, closeQuickAddModal, submitQuickAddTask } from './modules/courses.js';
import { isSimulatingGrades, simulatedGradesMap, loadGradesPage, toggleGradeSimulator, resetGradeSimulation, simulateAssignmentGrade, updateAssignmentGrade, toggleExcludeGpa } from './modules/grades.js';
import { calendarInstance, generateICSString, initCalendar, loadCalendarCourses, exportToICS, openEventModal, closeEventModal, deleteCustomEvent } from './modules/calendar.js';
import { generateQuizQuestions, generateQuizFromNotes, generateStudyDeck, renderFlashcardView, flipCurrentCard, nextFlashcard, prevFlashcard, calculateSM2Repetition, rateFlashcardSM2, getSavedDeckMastery, saveCardMastery, speakCurrentFlashcard, exportFlashcardsAsCSV } from './modules/flashcards.js';
import { formatMathFormula, renderMarkdownToHtml } from './modules/markdown.js';
import { getUnitNumber, getLessonNumber, getRestDays, setRestDays, toggleRestDay, generateBalancedStudyPlan, renderStudyPlanDashboardWidget, ensureStudyPlanDayModalExists, openStudyPlanDayModal, closeStudyPlanDayModal, startStudyPlanTimer, toggleStudyPlanAssignment } from './modules/studyPlan.js';
import { getOfflineDb, cacheDataLocally, getLocalCachedData, queueOfflineMutation, initNetworkStatusListeners } from './modules/offlineDb.js';
import { DueVinciSidebar } from './modules/components.js';
import { refreshProfileAvatar, uploadProfileAvatar, removeProfileAvatar } from './modules/profileAvatar.js';
import { buildBackupPayload, validateBackupPayload, exportUserDataJSON, importUserDataJSON, syncDataWithSupabase } from './modules/backup.js';
import { startWalkthrough, updateTourButtonVisibility, replayTourFromSettings, showFirstRunOnboarding, openWhatsNewModal, closeWhatsNewModal, checkWhatsNewOnLaunch } from './modules/tour.js';
import { getReminderPreferences, saveReminderPreferences, collectReminderItems, requestReminderPermission, renderReminderDashboard, checkDueReminders, startReminderService, stopReminderService, refreshReminderSettings } from './modules/reminders.js';
import { prioritizeTodayTasks, renderTodayWorkspace, completeTodayTask, startTodayFocus } from './modules/today.js';
import { toggleCommandPalette, filterCommandPalette, executeCmd, triggerMaestroRain, triggerNightOwlFlight, triggerKonamiEasterEgg } from './modules/easterEggs.js';
import { triggerPWAInstall, dismissPWABanner, initPWA } from './modules/pwa.js';
import { initializeErrorReporting } from './modules/errorReporting.js';
import { changeTheme, toggleGreekTheme, updateDateFormat, toggleMuteAlarm, updateAlarmSound, updateAmbientNoise, updateGpaScale, toggleSidebar, openSettingsModal, closeSettingsModal, showSettingsMovedNotice, switchSettingsTab, openSupportModal, closeSupportModal, switchSupportTab, submitSupportMessage, sendDirectMailto, confirmAccountDeletion } from './modules/ui.js';
import './modules/canvas.js'; // Canvas LMS Sync — optional add-on, zero impact on free core

// Re-export for external and test suite imports
export {
    supabaseClient,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    currentUser,
    checkUser,
    handleAuth,
    showAuthMessage,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
    logout,
    initPasskeyUI,
    signInWithPasskey,
    registerPasskey,
    getCurrentPageName,
    smartParseDate,
    parseInputDate,
    fireConfetti,
    recordStudyActivity,
    playTimerAlarm,
    toggleAmbientNoise,
    speakText,
    getTourCookie,
    setTourCookie,
    getBasePath,
    calculateStudyStreak,
    calculateDaysRemaining,
    getWorkloadIntensity,
    calculateCumulativeGpa,
    renderAcademicsDashboardWidget,
    injectAcademicsSettingsToggle,
    toggleAcademicsVisibility,
    createTimerState,
    stepTimerState,
    formatTimerTime,
    activeTimers,
    addNewTimer,
    deleteTimer,
    resetMultiTimer,
    toggleMultiTimerRun,
    initMultiTimersUI,
    renderTimersManager,
    toggleTimer,
    resetTimer,
    skipTimer,
    toggleTimerSettings,
    saveTimerSettings,
    setTimerDuration,
    toggleTimerCollapse,
    toggleCustomTimersSection,
    dismissFloatingTimer,
    updateTimerDisplay,
    updateFloatingTimer,
    applyTimerCollapse,
    localCourses,
    loadDashboardStats,
    loadCoursesPage,
    initCourseForm,
    renderTermFolders,
    renderAlphabeticals,
    openCourseModal,
    closeCourseModal,
    openTermModal,
    closeTermModal,
    loadAssignments,
    toggleAssignment,
    updateAssignmentDate,
    updateAssignmentPriority,
    updateAssignmentType,
    updateAssignmentTitle,
    editAssignmentTitlePrompt,
    deleteAssignment,
    submitAddAssignment,
    addSubItem,
    changeAssignmentPage,
    updateScratchpadPreview,
    downloadCourseNotesAsMarkdown,
    filterDashboardUpNext,
    openQuickAddModal,
    closeQuickAddModal,
    submitQuickAddTask,
    isSimulatingGrades,
    simulatedGradesMap,
    loadGradesPage,
    toggleGradeSimulator,
    resetGradeSimulation,
    simulateAssignmentGrade,
    updateAssignmentGrade,
    toggleExcludeGpa,
    calendarInstance,
    generateICSString,
    initCalendar,
    loadCalendarCourses,
    exportToICS,
    openEventModal,
    closeEventModal,
    deleteCustomEvent,
    generateQuizQuestions,
    generateQuizFromNotes,
    generateStudyDeck,
    renderFlashcardView,
    flipCurrentCard,
    nextFlashcard,
    prevFlashcard,
    calculateSM2Repetition,
    rateFlashcardSM2,
    getSavedDeckMastery,
    saveCardMastery,
    speakCurrentFlashcard,
    exportFlashcardsAsCSV,
    formatMathFormula,
    renderMarkdownToHtml,
    getUnitNumber,
    getLessonNumber,
    getRestDays,
    setRestDays,
    toggleRestDay,
    generateBalancedStudyPlan,
    renderStudyPlanDashboardWidget,
    ensureStudyPlanDayModalExists,
    openStudyPlanDayModal,
    closeStudyPlanDayModal,
    startStudyPlanTimer,
    toggleStudyPlanAssignment,
    getOfflineDb,
    cacheDataLocally,
    getLocalCachedData,
    queueOfflineMutation,
    initNetworkStatusListeners,
    DueVinciSidebar,
    refreshProfileAvatar,
    uploadProfileAvatar,
    removeProfileAvatar,
    buildBackupPayload,
    validateBackupPayload,
    exportUserDataJSON,
    importUserDataJSON,
    syncDataWithSupabase,
    startWalkthrough,
    updateTourButtonVisibility,
    replayTourFromSettings,
    showFirstRunOnboarding,
    openWhatsNewModal,
    closeWhatsNewModal,
    checkWhatsNewOnLaunch,
    getReminderPreferences,
    saveReminderPreferences,
    collectReminderItems,
    requestReminderPermission,
    renderReminderDashboard,
    checkDueReminders,
    startReminderService,
    stopReminderService,
    refreshReminderSettings,
    prioritizeTodayTasks,
    renderTodayWorkspace,
    completeTodayTask,
    startTodayFocus,
    toggleCommandPalette,
    filterCommandPalette,
    executeCmd,
    triggerMaestroRain,
    triggerNightOwlFlight,
    triggerKonamiEasterEgg,
    triggerPWAInstall,
    dismissPWABanner,
    initPWA,
    changeTheme,
    toggleGreekTheme,
    updateDateFormat,
    toggleMuteAlarm,
    updateAlarmSound,
    updateAmbientNoise,
    updateGpaScale,
    toggleSidebar,
    openSettingsModal,
    closeSettingsModal,
    showSettingsMovedNotice,
    switchSettingsTab,
    openSupportModal,
    closeSupportModal,
    switchSupportTab,
    submitSupportMessage,
    sendDirectMailto,
    confirmAccountDeletion
};

// Bind everything to window / globalThis for HTML inline handlers & Vitest
const _rootScope = typeof window !== 'undefined' ? window : globalThis;
_rootScope.supabaseClient = supabaseClient;
_rootScope.checkUser = checkUser;
_rootScope.handleAuth = handleAuth;
_rootScope.signInWithEmail = signInWithEmail;
_rootScope.signInWithGoogle = signInWithGoogle;
_rootScope.signUpWithEmail = signUpWithEmail;
_rootScope.logout = logout;
_rootScope.signOut = logout;
_rootScope.initPasskeyUI = initPasskeyUI;
_rootScope.signInWithPasskey = signInWithPasskey;
_rootScope.registerPasskey = registerPasskey;
_rootScope.getCurrentPageName = getCurrentPageName;
_rootScope.smartParseDate = smartParseDate;
_rootScope.parseInputDate = parseInputDate;
_rootScope.fireConfetti = fireConfetti;
_rootScope.recordStudyActivity = recordStudyActivity;
_rootScope.playTimerAlarm = playTimerAlarm;
_rootScope.toggleAmbientNoise = toggleAmbientNoise;
_rootScope.speakText = speakText;
_rootScope.calculateStudyStreak = calculateStudyStreak;
_rootScope.calculateDaysRemaining = calculateDaysRemaining;
_rootScope.getWorkloadIntensity = getWorkloadIntensity;
_rootScope.calculateCumulativeGpa = calculateCumulativeGpa;
_rootScope.renderAcademicsDashboardWidget = renderAcademicsDashboardWidget;
_rootScope.injectAcademicsSettingsToggle = injectAcademicsSettingsToggle;
_rootScope.toggleAcademicsVisibility = toggleAcademicsVisibility;
_rootScope.createTimerState = createTimerState;
_rootScope.stepTimerState = stepTimerState;
_rootScope.formatTimerTime = formatTimerTime;
_rootScope.addNewTimer = addNewTimer;
_rootScope.deleteTimer = deleteTimer;
_rootScope.resetMultiTimer = resetMultiTimer;
_rootScope.toggleMultiTimerRun = toggleMultiTimerRun;
_rootScope.initMultiTimersUI = initMultiTimersUI;
_rootScope.renderTimersManager = renderTimersManager;
_rootScope.toggleTimer = toggleTimer;
_rootScope.resetTimer = resetTimer;
_rootScope.skipTimer = skipTimer;
_rootScope.toggleTimerSettings = toggleTimerSettings;
_rootScope.saveTimerSettings = saveTimerSettings;
_rootScope.setTimerDuration = setTimerDuration;
_rootScope.toggleTimerCollapse = toggleTimerCollapse;
_rootScope.toggleCustomTimersSection = toggleCustomTimersSection;
_rootScope.dismissFloatingTimer = dismissFloatingTimer;
_rootScope.updateTimerDisplay = updateTimerDisplay;
_rootScope.updateFloatingTimer = updateFloatingTimer;
_rootScope.applyTimerCollapse = applyTimerCollapse;
_rootScope.loadDashboardStats = loadDashboardStats;
_rootScope.loadCoursesPage = loadCoursesPage;
_rootScope.initCourseForm = initCourseForm;
_rootScope.renderTermFolders = renderTermFolders;
_rootScope.renderAlphabeticals = renderAlphabeticals;
_rootScope.openCourseModal = openCourseModal;
_rootScope.closeCourseModal = closeCourseModal;
_rootScope.openTermModal = openTermModal;
_rootScope.closeTermModal = closeTermModal;
_rootScope.loadAssignments = loadAssignments;
_rootScope.toggleAssignment = toggleAssignment;
_rootScope.updateAssignmentDate = updateAssignmentDate;
_rootScope.updateAssignmentPriority = updateAssignmentPriority;
_rootScope.updateAssignmentType = updateAssignmentType;
_rootScope.updateAssignmentTitle = updateAssignmentTitle;
_rootScope.editAssignmentTitlePrompt = editAssignmentTitlePrompt;
_rootScope.deleteAssignment = deleteAssignment;
_rootScope.submitAddAssignment = submitAddAssignment;
_rootScope.addSubItem = addSubItem;
_rootScope.changeAssignmentPage = changeAssignmentPage;
_rootScope.updateScratchpadPreview = updateScratchpadPreview;
_rootScope.downloadCourseNotesAsMarkdown = downloadCourseNotesAsMarkdown;
_rootScope.filterDashboardUpNext = filterDashboardUpNext;
_rootScope.openQuickAddModal = openQuickAddModal;
_rootScope.closeQuickAddModal = closeQuickAddModal;
_rootScope.submitQuickAddTask = submitQuickAddTask;
_rootScope.loadGradesPage = loadGradesPage;
_rootScope.toggleGradeSimulator = toggleGradeSimulator;
_rootScope.resetGradeSimulation = resetGradeSimulation;
_rootScope.simulateAssignmentGrade = simulateAssignmentGrade;
_rootScope.updateAssignmentGrade = updateAssignmentGrade;
_rootScope.toggleExcludeGpa = toggleExcludeGpa;
_rootScope.generateICSString = generateICSString;
_rootScope.initCalendar = initCalendar;
_rootScope.loadCalendarCourses = loadCalendarCourses;
_rootScope.exportToICS = exportToICS;
_rootScope.openEventModal = openEventModal;
_rootScope.closeEventModal = closeEventModal;
_rootScope.deleteCustomEvent = deleteCustomEvent;
_rootScope.generateQuizQuestions = generateQuizQuestions;
_rootScope.generateQuizFromNotes = generateQuizFromNotes;
_rootScope.generateStudyDeck = generateStudyDeck;
_rootScope.renderFlashcardView = renderFlashcardView;
_rootScope.flipCurrentCard = flipCurrentCard;
_rootScope.nextFlashcard = nextFlashcard;
_rootScope.prevFlashcard = prevFlashcard;
_rootScope.calculateSM2Repetition = calculateSM2Repetition;
_rootScope.rateFlashcardSM2 = rateFlashcardSM2;
_rootScope.getSavedDeckMastery = getSavedDeckMastery;
_rootScope.saveCardMastery = saveCardMastery;
_rootScope.speakCurrentFlashcard = speakCurrentFlashcard;
_rootScope.exportFlashcardsAsCSV = exportFlashcardsAsCSV;
_rootScope.formatMathFormula = formatMathFormula;
_rootScope.renderMarkdownToHtml = renderMarkdownToHtml;
_rootScope.getUnitNumber = getUnitNumber;
_rootScope.getLessonNumber = getLessonNumber;
_rootScope.getRestDays = getRestDays;
_rootScope.setRestDays = setRestDays;
_rootScope.toggleRestDay = toggleRestDay;
_rootScope.generateBalancedStudyPlan = generateBalancedStudyPlan;
_rootScope.renderStudyPlanDashboardWidget = renderStudyPlanDashboardWidget;
_rootScope.ensureStudyPlanDayModalExists = ensureStudyPlanDayModalExists;
_rootScope.openStudyPlanDayModal = openStudyPlanDayModal;
_rootScope.closeStudyPlanDayModal = closeStudyPlanDayModal;
_rootScope.startStudyPlanTimer = startStudyPlanTimer;
_rootScope.toggleStudyPlanAssignment = toggleStudyPlanAssignment;
_rootScope.getOfflineDb = getOfflineDb;
_rootScope.cacheDataLocally = cacheDataLocally;
_rootScope.getLocalCachedData = getLocalCachedData;
_rootScope.queueOfflineMutation = queueOfflineMutation;
_rootScope.initNetworkStatusListeners = initNetworkStatusListeners;
_rootScope.buildBackupPayload = buildBackupPayload;
_rootScope.validateBackupPayload = validateBackupPayload;
_rootScope.exportUserDataJSON = exportUserDataJSON;
_rootScope.importUserDataJSON = importUserDataJSON;
_rootScope.syncDataWithSupabase = syncDataWithSupabase;
_rootScope.getTourCookie = getTourCookie;
_rootScope.setTourCookie = setTourCookie;
_rootScope.startWalkthrough = startWalkthrough;
_rootScope.updateTourButtonVisibility = updateTourButtonVisibility;
_rootScope.replayTourFromSettings = replayTourFromSettings;
_rootScope.showFirstRunOnboarding = showFirstRunOnboarding;
_rootScope.openWhatsNewModal = openWhatsNewModal;
_rootScope.closeWhatsNewModal = closeWhatsNewModal;
_rootScope.checkWhatsNewOnLaunch = checkWhatsNewOnLaunch;
_rootScope.requestReminderPermission = requestReminderPermission;
_rootScope.saveReminderSettingsFromUI = window.saveReminderSettingsFromUI;
_rootScope.renderTodayWorkspace = renderTodayWorkspace;
_rootScope.completeTodayTask = completeTodayTask;
_rootScope.startTodayFocus = startTodayFocus;
_rootScope.toggleCommandPalette = toggleCommandPalette;
_rootScope.filterCommandPalette = filterCommandPalette;
_rootScope.executeCmd = executeCmd;
_rootScope.triggerMaestroRain = triggerMaestroRain;
_rootScope.triggerNightOwlFlight = triggerNightOwlFlight;
_rootScope.triggerKonamiEasterEgg = triggerKonamiEasterEgg;
_rootScope.triggerPWAInstall = triggerPWAInstall;
_rootScope.dismissPWABanner = dismissPWABanner;
_rootScope.changeTheme = changeTheme;
_rootScope.toggleGreekTheme = toggleGreekTheme;
_rootScope.updateDateFormat = updateDateFormat;
_rootScope.toggleMuteAlarm = toggleMuteAlarm;
_rootScope.updateAlarmSound = updateAlarmSound;
_rootScope.updateAmbientNoise = updateAmbientNoise;
_rootScope.updateGpaScale = updateGpaScale;
_rootScope.toggleSidebar = toggleSidebar;
_rootScope.openSettingsModal = openSettingsModal;
_rootScope.closeSettingsModal = closeSettingsModal;
_rootScope.switchSettingsTab = switchSettingsTab;
_rootScope.openSupportModal = openSupportModal;
_rootScope.closeSupportModal = closeSupportModal;
_rootScope.switchSupportTab = switchSupportTab;
_rootScope.submitSupportMessage = submitSupportMessage;
_rootScope.sendDirectMailto = sendDirectMailto;
_rootScope.confirmAccountDeletion = confirmAccountDeletion;

// Bootstrap application on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        applyTimerCollapse();
        updateTimerDisplay();
        initMultiTimersUI();
        initNetworkStatusListeners(supabaseClient);
        initializeErrorReporting();
        initPasskeyUI();
        initCourseForm();

        // Restore ambient noise if active
        const savedAmbient = localStorage.getItem('duevinci_ambient_noise');
        if (savedAmbient && savedAmbient !== 'off') {
            toggleAmbientNoise(savedAmbient);
        }

        // Render Study Plan widget on Dashboard
        const currentPage = getCurrentPageName();
        if (currentPage === 'index' || currentPage === 'index.html' || currentPage === '') {
            renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
        }

        setTimeout(() => {
            checkWhatsNewOnLaunch();
            updateTourButtonVisibility();
        }, 400);
    });

    checkUser();
}
