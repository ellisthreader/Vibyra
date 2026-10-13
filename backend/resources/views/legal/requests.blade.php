@extends('legal.layout')

@section('title', 'Contact and privacy requests')
@section('description', 'Contact Vibyra for product support or help with privacy, billing and accessibility.')

@section('content')
    <div class="eyebrow">Support &amp; privacy</div>
    <h1>Contact and privacy requests</h1>
    <p class="lead">Ask for product support, or send a privacy, billing, community or accessibility request.</p>
    <p class="updated">Last updated: 13 October 2026</p>

    <section>
        <h2>Make a request</h2>
        <p>Use the email address associated with your account or waitlist entry when possible. We may need to verify ownership before acting. Sending this request does not automatically delete your account, cancel a subscription or approve a refund.</p>
        @if (session('request_reference'))
            <p class="notice" role="status">Your request was recorded. Reference: <strong>{{ session('request_reference') }}</strong>. Keep this reference for your records.</p>
        @endif
        @if ($errors->any())
            <div class="form-error" role="alert">
                <p>Please correct the following:</p>
                <ul>@foreach ($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul>
            </div>
        @endif
        <form class="request-form" method="post" action="{{ route('privacy.requests.store') }}">
            @csrf
            <label for="request-email">Email address</label>
            <input id="request-email" name="email" type="email" autocomplete="email" maxlength="254" required value="{{ old('email') }}">
            <label for="request-topic">What is your request about?</label>
            <select id="request-topic" name="topic" required>
                <option value="">Choose one</option>
                @foreach ([
                    'privacy_access' => 'Access to personal data',
                    'privacy_correction' => 'Correct personal data',
                    'privacy_deletion' => 'Delete personal data',
                    'privacy_restriction' => 'Restrict processing',
                    'privacy_portability' => 'Data portability',
                    'privacy_objection' => 'Object to processing',
                    'waitlist_removal' => 'Remove waitlist address',
                    'refund' => 'Refund request',
                    'billing' => 'Billing or cancellation issue',
                    'community_report' => 'Community report or appeal',
                    'accessibility' => 'Accessibility issue',
                    'security' => 'Security concern',
                    'support' => 'Product support',
                    'other' => 'Other question or notice',
                ] as $value => $label)
                    <option value="{{ $value }}" @selected(old('topic', request()->query('topic')) === $value)>{{ $label }}</option>
                @endforeach
            </select>
            <label for="request-details">Brief details <span class="optional">(optional, 500 characters maximum)</span></label>
            <textarea id="request-details" name="details" maxlength="500" rows="5">{{ old('details') }}</textarea>
            <p class="form-help">For refunds, include the purchase date. For community or accessibility issues, include a page or project link if useful. Do not include passwords, payment card numbers, identity documents, private project content, or other unnecessary sensitive information.</p>
            <button type="submit">Submit request</button>
        </form>
        <p>Keep your reference when contacting <a href="mailto:support@vibyra.net">support@vibyra.net</a> about this request. Your reference confirms receipt; it does not mean the request has already been reviewed. If you are dissatisfied with the handling of a privacy request, you may contact your local data protection authority.</p>
    </section>

    <section>
        <h2>Controls you can use now</h2>
        <ul>
            <li>Open <a href="/?analytics=choices" data-analytics-choices>Analytics choices</a> to allow or decline optional website measurement.</li>
            <li><a href="/account/delete">Delete your account</a> using the app, or request help if you cannot access it.</li>
            <li>Read the <a href="{{ route('legal.privacy') }}">Privacy Policy</a> for more about processing, retention and choices.</li>
        </ul>
    </section>
@endsection
