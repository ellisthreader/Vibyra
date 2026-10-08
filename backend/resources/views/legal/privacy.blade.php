@extends('legal.layout')

@section('title', 'Privacy Policy')
@section('description', 'How Vibyra collects, uses, shares, and protects personal data.')

@section('content')
    <div class="eyebrow">Legal</div>
    <h1>Privacy Policy</h1>
    <p class="lead">This policy explains what information Vibyra handles when you use the website, mobile app, desktop app, connected services, and community features.</p>
    <p class="updated">Effective and last updated: 8 August 2026</p>

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
        <p>We use access controls, encrypted transport for public services, protected credential storage, rate limits, and session revocation. No system is completely secure, so keep devices and account credentials protected and report suspected misuse promptly.</p>
    </section>

    <section>
        <h2>7. Your choices and rights</h2>
        <p>You can update account details, revoke sessions, clear local caches, control optional improvement signals, remove community listings, or delete your account through available product controls. Depending on applicable law, you may also request access, correction, deletion, restriction, portability, or an objection to processing.</p>
        <p>Contact us to exercise a right. We may need to verify your identity. You may also complain to the data protection authority that applies where you live.</p>
    </section>

    <section>
        <h2>8. Children, transfers, and changes</h2>
        <p>Vibyra is not directed to children who cannot legally consent to use an online service. Service providers may process data in other countries; where required, we use recognized transfer safeguards.</p>
        <p>We may update this policy as the product or law changes. We will update the date above and provide additional notice when a material change requires it.</p>
    </section>
@endsection
