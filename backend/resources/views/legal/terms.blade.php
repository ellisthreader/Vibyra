@extends('legal.layout')

@section('title', 'Terms of Service')
@section('description', 'The terms that apply when using Vibyra products and services.')

@section('content')
    <div class="eyebrow">Legal</div>
    <h1>Terms of Service</h1>
    <p class="lead">These terms govern your use of Vibyra's website, mobile app, desktop app, connected services, AI features, and community.</p>
    <p class="updated">Effective and last updated: 8 August 2026</p>

    <section>
        <h2>1. Agreement and eligibility</h2>
        <p>By creating an account or using Vibyra, you agree to these terms and the <a href="{{ route('legal.privacy') }}">Privacy Policy</a>. You must be legally able to enter this agreement. If you use Vibyra for an organization, you confirm that you can bind that organization.</p>
    </section>

    <section>
        <h2>2. Accounts and security</h2>
        <p>Provide accurate information, protect your credentials and connected devices, and keep session access under your control. You are responsible for activity performed through your account unless caused by Vibyra's breach of these terms. Tell us promptly about suspected unauthorized access.</p>
    </section>

    <section>
        <h2>3. The service</h2>
        <p>Vibyra helps you coordinate coding tools, AI services, connected devices, project previews, publishing, and related workflows. Desktop operations may read or change files, run commands, start local services, or contact third-party providers when you request or approve those actions.</p>
        <p class="notice">Review proposed commands, edits, destinations, permissions, and generated output before approval. Keep independent backups and use version control for important work.</p>
    </section>

    <section>
        <h2>4. AI output and third-party services</h2>
        <p>AI output can be incomplete, insecure, inaccurate, or similar to other output. You remain responsible for reviewing, testing, licensing, and deciding whether to use it. Do not rely on Vibyra or AI output as professional legal, medical, financial, or safety advice.</p>
        <p>Third-party coding tools, model providers, identity providers, app stores, hosting platforms, and payment services may have separate terms. Vibyra is not responsible for a third party's independent service, availability, or content.</p>
    </section>

    <section>
        <h2>5. Your content</h2>
        <p>You retain ownership of content you submit. You grant Vibyra a limited worldwide license to host, copy, process, transmit, and display it only as needed to operate, secure, improve, and support the service and to provide features you select.</p>
        <p>When you publish an app, comment, or other item publicly, you grant Vibyra permission to display and distribute that public content and allow users to access it through the community. You can remove eligible public listings using available controls, subject to reasonable backup and legal retention.</p>
    </section>

    <section>
        <h2>6. Acceptable use</h2>
        <p>Do not use Vibyra to break the law; violate intellectual property, privacy, or security rights; distribute malware; access systems without permission; harass or exploit people; evade service limits; interfere with the service; or publish deceptive, harmful, or unsafe content. Do not probe or reverse engineer protected parts of the service except where law expressly permits it.</p>
        <p>We may review, restrict, remove, or preserve content and suspend access when reasonably necessary to enforce these terms, protect people or systems, investigate abuse, or comply with law.</p>
    </section>

    <section>
        <h2>7. Plans, credits, and payments</h2>
        <p>Paid plans, billing periods, included credits, usage limits, renewal terms, and prices are shown before purchase. Taxes may apply. Subscriptions renew until cancelled through the applicable billing channel. Credits are service usage units, not money, and cannot be transferred or redeemed for cash unless law requires otherwise.</p>
        <p>Refund and cancellation rights depend on applicable law and the payment platform used. App Store or Google Play purchases are also governed by that store's billing rules.</p>
    </section>

    <section>
        <h2>8. Availability and changes</h2>
        <p>We work to keep Vibyra reliable but do not promise uninterrupted or error-free operation. Features may change, be limited, or be discontinued for security, legal, technical, or product reasons. We will give reasonable notice of material changes where practical.</p>
    </section>

    <section>
        <h2>9. Disclaimers and liability</h2>
        <p>To the extent permitted by law, Vibyra is provided "as is" and without implied warranties that can legally be excluded. Vibyra is not liable for indirect, incidental, special, consequential, or lost-profit damages, or for losses caused by unreviewed output, third-party services, or failure to maintain backups.</p>
        <p>Nothing in these terms excludes liability that cannot lawfully be excluded, including liability for fraud or death or personal injury caused by negligence where applicable. Any other liability is limited to the amount you paid Vibyra for the service during the 12 months before the event giving rise to the claim.</p>
    </section>

    <section>
        <h2>10. Ending use and general terms</h2>
        <p>You may stop using Vibyra or delete your account at any time. We may suspend or terminate access for a material or repeated breach, serious security risk, non-payment, or legal requirement. Provisions that by their nature should survive will continue after termination.</p>
        <p>Applicable law governs these terms without limiting mandatory consumer protections where you live. If one provision is unenforceable, the rest remain effective. Delay in enforcement is not a waiver. Contact <a href="mailto:support@vibyra.app">support@vibyra.app</a> with questions or formal notices.</p>
    </section>
@endsection
