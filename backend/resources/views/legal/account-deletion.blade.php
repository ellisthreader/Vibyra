@extends('legal.layout')

@section('title', 'Delete your account')
@section('description', 'How to delete your Vibyra account or request help with account deletion.')

@section('content')
    <div class="eyebrow">Your account</div>
    <h1>Delete your account</h1>
    <p class="lead">You can delete your Vibyra account in the app. If you cannot access the app, send a deletion request below.</p>

    <section>
        <h2>Delete in the iPhone app</h2>
        <ol>
            <li>Sign in to the Vibyra account you want to delete.</li>
            <li>Open <strong>Settings → Account → Delete account</strong>.</li>
            <li>Read the confirmation and verify your identity to complete deletion.</li>
        </ol>
        <p>For an email account, use your password. For an Apple or Google account, follow the provider verification shown in the app.</p>
        <p>Account deletion is permanent. It removes your Vibyra account and signs out its sessions. Files on your own computer are not deleted. Some records may need to be retained as described in the <a href="{{ route('legal.privacy') }}">Privacy Policy</a>.</p>
    </section>

    <section>
        <h2>Cannot access the app?</h2>
        <p>Use the email address associated with your account when you <a href="{{ route('privacy.requests', ['topic' => 'privacy_deletion']) }}">request account deletion</a>. Keep the reference shown after submission. We may need to verify ownership before acting; submitting a request does not immediately delete an account.</p>
        <p>Do not send your password, authentication codes or identity documents in the request.</p>
    </section>

    <section>
        <h2>Check your subscription</h2>
        <p>Deleting an account does not by itself cancel an App Store subscription. Manage it in your iPhone’s <strong>Settings → your name → Subscriptions</strong>. For help with another billing method, <a href="{{ route('privacy.requests', ['topic' => 'billing']) }}">contact billing support</a>.</p>
    </section>
@endsection
