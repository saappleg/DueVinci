DueVinci Privacy, Security, and Data Retention Policy
Last Updated: August 19, 2026
At DueVinci, your privacy and data security are our highest priorities. This policy outlines how your information is collected, used, protected, and retained when you use the DueVinci web application.
1. Information We Collect
To provide you with a personalized academic planning experience, we collect the following types of information:
 * Account Information: When you sign up, we collect your email address and a securely hashed password to authenticate your account.
 * Academic Data: We store the course codes, unit titles, assignments, due dates, grades, and custom calendar events you input into the application.
 * Document & Image Uploads: If you use the AI import features, you may upload course syllabi (PDFs) or screenshots of your course schedule.
2. Data Security & Storage
We utilize modern, industry-standard security protocols to ensure your data remains completely private.
 * Secure Infrastructure: DueVinci is powered by Supabase. All data is encrypted in transit (via HTTPS) and at rest.
 * Row Level Security (RLS): Our PostgreSQL database utilizes strict Row Level Security policies. This ensures that your academic data, grades, and schedules are strictly isolated to your specific account. No other user can access, read, or modify your database rows.
 * Authentication: We use Supabase Auth to handle secure user sign-ups, logins, and session token management.
3. Artificial Intelligence & Third-Party Processing
DueVinci leverages AI to automate syllabus parsing and schedule generation. We process this data with strict privacy controls:
 * Secure Edge Functions: Document and image uploads are processed via server-side Deno Edge Functions. Your API requests are routed securely, ensuring no sensitive API keys are exposed to the client browser.
 * Google Gemini API: We utilize Google's Gemini API strictly for data extraction (reading your syllabus or screenshot to map out assignments).
 * No AI Training: In accordance with Google Cloud’s API data privacy policies, the syllabi and screenshots processed through the Gemini API are not retained by Google, nor are they used to train Google’s foundation AI models. Data is processed transiently and discarded after your schedule is generated.
4. Local Storage & Device Data
To ensure a fast and customizable experience, DueVinci stores certain non-sensitive preferences directly on your device using your browser's localStorage.
 * Saved Preferences: This includes your theme selection (dark/light mode), date formatting preferences, GPA scale choices, and timer configuration (focus/break minutes and collapse states).
 * No Tracking Cookies: We do not use third-party tracking cookies or advertising pixels. Your local storage is used exclusively to keep the app functioning seamlessly across sessions.
5. Data Retention & Deletion
You retain absolute control over your academic data.
 * Active Retention: Your data is kept in our database only for as long as you maintain an active account and actively store those specific courses.
 * Immediate Deletion: If you choose to delete a course, term folder, or assignment from your DueVinci dashboard, that data is permanently and immediately destroyed from our database. It cannot be recovered.
 * Account Deletion: You have the right to request the complete deletion of your account and all associated data at any time.
6. Changes to This Policy
We may update this policy periodically to reflect changes to our application architecture or privacy regulations. Any significant updates will be reflected by the "Last Updated" date at the top of this document.
7. Contact
If you have any questions, concerns, or requests regarding this policy or how your data is handled, please contact the developer:
Steven Applegate
DueVinci Creator & Administrator
