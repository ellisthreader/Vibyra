@extends('legal.layout')

@section('title', 'Privacy Policy')
@section('description', 'How Vibyra collects, uses, shares, and protects personal data.')

@section('content')
    <div class="eyebrow">Legal</div>
    <h1>Privacy Policy</h1>
    <p class="lead">This policy explains what information Vibyra handles when you use the website, mobile app, desktop app, connected services, and community features.</p>
    <p class="updated">Effective and last updated: 26 September 2026</p>

    <section>
        <h2>1. Who is responsible</h2>
        <p>Vibyra is responsible for the personal data described in this policy. Contact <a href="mailto:support@vibyra.app">support@vibyra.app</a> with privacy questions or requests.</p>
    </section>

    <section>
        <h2>2. Information we handle</h2>
        <ul>
            <li><strong>Account information:</strong> name, email address, authentication provider identifiers, verification state, profile details, and account preferences.</li>
            <li><strong>Session and device information:</strong> session tokens, device and installation identifiers, device name, IP address, user agent, approximate location derived from a public IP, and security timestamps.</li>
            <li><strong>Product content:</strong> prompts, chat history, project metadata, project memory, generated output, files or excerpts you choose to send, and approval decisions.</li>
            <li><strong>Community content:</strong> published app details, previews, comments, reactions, moderation results, and private report evidence such as notes or screenshots.</li>
            <li><strong>Billing and usage information:</strong> plan, credit balance and usage, purchase identifiers, and subscription status. Payment providers process full payment credentials; Vibyra does not store complete card numbers.</li>
            <li><strong>Service analytics:</strong> if allowed, page views, named links and downloads, bounded time on active pages or apps, app opens, and supported AI or project action counts. Events use short categories such as platform, model, screen, and approximate country derived on the server. They exclude prompt text, typing, terminal output, project names, file paths, raw IP addresses, and full URLs. We retain a protected pseudonymous choice identifier so withdrawal can erase its events. A separate account-link option allows events to be associated with your account.</li>
            <li><strong>Diagnostics:</strong> service logs, failure details, performance and security events, and optional anonymous improvement signals when enabled.</li>
        </ul>
    </section>

    <section>
        <h2>3. Local and cloud processing</h2>
        <p>Vibyra Desktop runs supported coding tools and project operations on your computer. Paired phone and browser clients may communicate with that desktop over your network. Some state remains local unless you connect an account, enable synchronization, publish content, or use a cloud-backed feature.</p>
        <p class="notice">Only submit files, prompts, screenshots, or other content that you are permitted to use and share. Review the destination shown in Vibyra before approving an external or destructive action.</p>
    </section>

    <section>
        <h2>4. Why we use information</h2>
        <p>We use information to provide and secure accounts, connect devices, process requested AI and project operations, synchronize enabled data, calculate credits, process purchases, publish and moderate community content, provide support, prevent abuse, and improve reliability.</p>
        <p>Optional service analytics helps us understand adoption and improve Vibyra. Aggregate owner reports show counts and trends. If you separately allow account-linked analytics, restricted owner reports may associate your usage categories with your account. We never collect prompt text for owner analytics. Required account, login, billing, and security records are handled separately to operate and protect the service. The owner workspace also summarizes existing account creation, authenticated session use, Vibes cloud turns and model counts, and recorded provider cost. These service records are separate from optional analytics choices; the reports exclude prompt text, and recent token use does not prove someone is online.</p>
        <p>Depending on where you live, these activities rely on performing our agreement with you, your consent, compliance with law, and legitimate interests such as service security, fraud prevention, and product improvement.</p>
    </section>

    <section>
        <h2>5. Service providers and sharing</h2>
        <p>We share only the information needed with infrastructure and email providers, identity providers, payment platforms such as Stripe, Apple, or Google, and AI gateway or model providers used to process a request. Their own terms and privacy notices may also apply.</p>
        <p>Public community listings, comments, and profile attribution are visible to other people. Reports and their evidence are private to authorized moderation and support workflows. We may disclose information when required by law, to protect users or the service, or as part of a business transfer subject to appropriate safeguards.</p>
    </section>

    <section>
        <h2>6. Retention and security</h2>
        <p>We retain information while your account is active and as needed for the purposes above, dispute resolution, security, and legal obligations. Retention varies by data type. Deleted accounts and expired sessions may leave limited records where necessary for fraud prevention, billing, backups, or law.</p>
        <p>Optional event records are kept for up to 90 days and removed by scheduled cleanup. Suppressed, non-identifying daily totals may be kept for up to 13 months. Consent decisions and their history are retained as needed to honor and demonstrate your choices. Account, billing, and security records follow their own retention needs.</p>
        <p>We use access controls, encrypted transport for public services, protected credential storage, rate limits, and session revocation. No system is completely secure, so keep devices and account credentials protected and report suspected misuse promptly.</p>
    </section>

    <section>
        <h2>7. Your choices and rights</h2>
        <p>You can update account details, revoke sessions, clear local caches, control optional improvement signals, remove community listings, or delete your account through available product controls. Depending on applicable law, you may also request access, correction, deletion, restriction, portability, or an objection to processing.</p>
        <p>You can allow or decline optional website analytics at any time through <a href="/?analytics=choices">Analytics choices</a>, and change the equivalent choice in Desktop and iOS settings. Account linking is a separate, unchecked choice available after sign-in. Declining stops new optional events and removes retained events associated with that choice, including queued app events. Suppressed daily totals that no longer identify you may remain. Declining never blocks signup, downloads, or app use.</p>
        <p>Contact us to exercise a right. We may need to verify your identity. You may also complain to the data protection authority that applies where you live.</p>
    </section>

    <section>
        <h2>8. Children, transfers, and changes</h2>
        <p>Vibyra is not directed to children who cannot legally consent to use an online service. Service providers may process data in other countries; where required, we use recognized transfer safeguards.</p>
        <p>We may update this policy as the product or law changes. We will update the date above and provide additional notice when a material change requires it.</p>
    </section>
@endsection
