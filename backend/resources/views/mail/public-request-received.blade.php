New request from the Vibyra website

Reference: {!! $publicRequest->reference !!}
Received: {!! $publicRequest->created_at->utc()->format('Y-m-d H:i:s') !!} UTC
Topic: {!! \Illuminate\Support\Str::headline($publicRequest->topic) !!}
Email supplied by the requester: {!! $publicRequest->email !!}

Submitted details:
{!! filled($publicRequest->details) ? $publicRequest->details : '(No details provided)' !!}

Reply to this email to contact the requester. Their email address and account ownership have not been verified by this form.

The request is saved in Vibyra. Review it before taking action; submitting the form does not delete an account, cancel a subscription or approve a refund.
