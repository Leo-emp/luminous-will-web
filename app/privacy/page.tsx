export const metadata = {
  title: "Privacy Policy | Luminous Will",
  description: "Privacy Policy for Luminous Will video platform",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <a
          href="/"
          className="text-xs uppercase tracking-wider text-[#555] hover:text-[#E8A817] transition-colors"
        >
          &larr; Back
        </a>
      </div>

      <h1
        className="text-2xl font-bold mb-2"
        style={{ color: "#E8A817" }}
      >
        Privacy Policy
      </h1>
      <p className="text-sm text-[#555] mb-8">
        Last updated: July 6, 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed text-[#aaa]">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Introduction</h2>
          <p>
            This Privacy Policy explains how Luminous Will (&quot;the Service&quot;), operated at
            luminous-will-web.vercel.app, collects, uses, stores, and protects your information.
            We are committed to protecting your privacy and handling your data transparently.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>
          <p>We collect the following categories of information:</p>

          <h3 className="text-sm font-semibold text-[#ccc] mt-4 mb-1">
            2.1 OAuth Authentication Data
          </h3>
          <p>
            When you connect a social media account, we receive and store OAuth tokens
            (access tokens and refresh tokens) provided by the platform. These tokens allow
            the Service to post content on your behalf. We also store your account display
            name for identification purposes in the dashboard.
          </p>

          <h3 className="text-sm font-semibold text-[#ccc] mt-4 mb-1">
            2.2 Platform-Specific Data
          </h3>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>
              <strong className="text-[#ccc]">YouTube (Google):</strong> Channel name and OAuth
              tokens. We request the scopes <code className="text-[#E8A817] text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded">youtube.upload</code> and <code className="text-[#E8A817] text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded">youtube.readonly</code> to
              upload videos and read channel information. We do not access your private videos,
              playlists, watch history, or any data beyond what is required for publishing.
            </li>
            <li>
              <strong className="text-[#ccc]">TikTok:</strong> Username and OAuth tokens. We
              request the scopes <code className="text-[#E8A817] text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded">user.info.basic</code>, <code className="text-[#E8A817] text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded">video.upload</code>,
              and <code className="text-[#E8A817] text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded">video.publish</code> to
              upload and publish videos. We do not access your followers, messages, liked videos,
              or any personal data beyond basic profile information and video publishing.
            </li>
            <li>
              <strong className="text-[#ccc]">Meta (Instagram &amp; Facebook):</strong> Page name,
              Instagram account name, and OAuth tokens. We request permissions to manage posts
              on your Facebook Page and publish content to your Instagram account. We do not
              access your personal Facebook profile, private messages, friends list, or any data
              unrelated to content publishing.
            </li>
          </ul>

          <h3 className="text-sm font-semibold text-[#ccc] mt-4 mb-1">
            2.3 Generated Content Data
          </h3>
          <p>
            Videos, thumbnails, scripts, and metadata generated through the Service are stored
            temporarily in Vercel Blob storage for review and publishing. This content is
            associated with your session but does not contain personal information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
          <p>We use the collected information exclusively to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Authenticate your social media accounts via OAuth</li>
            <li>Upload and publish video content to your connected platforms on your behalf</li>
            <li>Display your account connection status in the Settings dashboard</li>
            <li>Automatically refresh expired access tokens to maintain your connections</li>
          </ul>
          <p className="mt-2">
            We do <strong className="text-[#ccc]">not</strong> use your data for advertising,
            analytics profiling, or any purpose beyond operating the Service as described.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Storage and Security</h2>
          <p>
            OAuth tokens are stored as encrypted JSON files in Vercel Blob storage with private
            access controls. Tokens are never exposed in client-side code, URLs, or logs.
            All communication between the Service and third-party platforms occurs over HTTPS.
          </p>
          <p className="mt-2">
            Environment variables containing API credentials (client IDs and secrets) are stored
            securely in Vercel&apos;s encrypted environment variable system and are never committed
            to source code or transmitted to the browser.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Data Sharing</h2>
          <p>
            We do <strong className="text-[#ccc]">not</strong> sell, rent, or share your personal
            data or OAuth tokens with any third parties. Data is transmitted only to the
            platform you have explicitly authorized (YouTube, TikTok, Instagram, or Facebook)
            for the purpose of publishing content.
          </p>
          <p className="mt-2">
            The Service uses the following third-party services for video generation, which
            do not receive your social media credentials or personal data:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>ElevenLabs — voiceover generation</li>
            <li>Pexels &amp; Pixabay — stock video footage</li>
            <li>Google Gemini — script generation</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Data Retention</h2>
          <p>
            OAuth tokens are retained for as long as your account remains connected. When you
            disconnect a platform via the Settings page, the associated tokens are immediately
            and permanently deleted from storage. Generated video content is retained in
            temporary storage until published or manually removed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong className="text-[#ccc]">Disconnect at any time:</strong> Visit the Settings
              page and click &quot;Disconnect&quot; on any platform to immediately revoke access and
              delete stored tokens.
            </li>
            <li>
              <strong className="text-[#ccc]">Revoke access externally:</strong> You can also
              revoke the Service&apos;s access directly from your platform&apos;s account settings
              (Google Account permissions, TikTok authorized apps, Facebook app settings).
            </li>
            <li>
              <strong className="text-[#ccc]">Request data deletion:</strong> Contact us to
              request complete deletion of all data associated with your use of the Service.
            </li>
            <li>
              <strong className="text-[#ccc]">Access your data:</strong> Contact us to request
              a copy of all data we hold about you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. TikTok Data Usage Disclosure</h2>
          <p>
            In compliance with TikTok&apos;s Developer Terms of Service, we disclose the following:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>We access TikTok user data solely for video publishing purposes</li>
            <li>We store only the minimum data required: OAuth tokens and basic profile display name</li>
            <li>We do not cache, store, or process TikTok user content (videos, comments, followers)</li>
            <li>We do not use TikTok data for any form of surveillance, tracking, or profiling</li>
            <li>We do not transfer TikTok user data to any third party</li>
            <li>Users can revoke access at any time through our Settings page or TikTok&apos;s app settings</li>
            <li>Upon disconnection, all TikTok-related tokens are permanently deleted</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for use by individuals under the age of 18. We do not
            knowingly collect personal information from children. If you believe a child has
            provided us with personal data, please contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this
            page with an updated revision date. Continued use of the Service after changes
            constitutes acceptance of the revised policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
          <p>
            For privacy-related questions, data requests, or concerns, contact us at:{" "}
            <a
              href="mailto:pmzo.mm08@gmail.com"
              className="text-[#E8A817] hover:underline"
            >
              pmzo.mm08@gmail.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-[#1a1a1a] text-xs text-[#333] text-center">
        Luminous Will &middot; luminous-will-web.vercel.app
      </div>
    </div>
  );
}
