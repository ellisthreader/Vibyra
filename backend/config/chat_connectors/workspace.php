<?php

return [
        'gmail' => [
            'name' => 'Gmail',
            'tagline' => 'Email search, reading and sending.',
            'blurb' => 'Find and read messages in your Gmail account, then send a plain-text email only after you approve its exact contents.',
            'category' => 'Communication',
            'abilities' => ['Search up to ten matching emails', 'Read one email and its plain-text body', 'Send one approved plain-text email'],
            'reads' => 'Your Gmail search results, message headers and plain-text message bodies. Attachments are not read.',
            'writes' => 'Sends one email to one recipient after you approve its recipient, subject and full body.',
            'credential' => [
                'label' => 'Sign in with Google', 'placeholder' => '',
                'help' => 'Continue to Google to allow Gmail reading and sending. You will return to Vibyra when connected.',
                'url' => 'https://accounts.google.com/',
            ],
            'oauth' => [
                'authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url' => 'https://oauth2.googleapis.com/token',
                'refresh_url' => 'https://oauth2.googleapis.com/token',
                'scope' => 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
                'client_id' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_SECRET'),
                'callback_base_url' => env('CHAT_CONNECTORS_GOOGLE_CALLBACK_BASE_URL'),
                'pkce' => true, 'access_type' => 'offline', 'prompt' => 'consent',
                'refresh_fields' => ['refresh_token', 'grant_type', 'client_id', 'client_secret'],
            ],
        ],

        'google_calendar' => [
            'name' => 'Google Calendar',
            'tagline' => 'Upcoming events and approved scheduling.',
            'blurb' => 'Review your next events and create an event on your primary calendar after approving its exact title and time.',
            'category' => 'Productivity',
            'abilities' => ['Read up to twenty upcoming events', 'Create one approved event without inviting attendees'],
            'reads' => 'Upcoming event titles, times, locations and links on your primary Google Calendar.',
            'writes' => 'Creates one event on your primary calendar after you approve its title, start, end and description. It does not invite attendees.',
            'credential' => [
                'label' => 'Sign in with Google', 'placeholder' => '',
                'help' => 'Continue to Google to allow Calendar event access. You will return to Vibyra when connected.',
                'url' => 'https://accounts.google.com/',
            ],
            'oauth' => [
                'authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url' => 'https://oauth2.googleapis.com/token',
                'refresh_url' => 'https://oauth2.googleapis.com/token',
                'scope' => 'openid email https://www.googleapis.com/auth/calendar.events',
                // Agent V2 "add another account" only: calendar list + free/busy need these
                // (sensitive scopes; add them in Google Auth Platform before live use).
                'agent_scope' => 'openid email https://www.googleapis.com/auth/calendar.events '
                    .'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy',
                'client_id' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_SECRET'),
                'callback_base_url' => env('CHAT_CONNECTORS_GOOGLE_CALLBACK_BASE_URL'),
                'pkce' => true, 'access_type' => 'offline', 'prompt' => 'consent',
                'refresh_fields' => ['refresh_token', 'grant_type', 'client_id', 'client_secret'],
            ],
        ],

        'google_drive' => [
            'name' => 'Google Drive',
            'tagline' => 'Files, Docs, Sheets and Slides.',
            'blurb' => 'Find files and read bounded text from Google Docs, Sheets, Slides and supported text files.',
            'category' => 'Productivity',
            'abilities' => ['Search up to twenty Drive files', 'Read one selected text file or Google document'],
            'reads' => 'File names, descriptions and bounded text from supported files you can access. Sheets read up to eight tabs per call and can continue with the next tabs.',
            'writes' => null,
            'credential' => [
                'label' => 'Sign in with Google', 'placeholder' => '',
                'help' => 'Continue to Google to allow read access to Drive files. You will return to Vibyra when connected.',
                'url' => 'https://accounts.google.com/',
            ],
            'oauth' => [
                'authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url' => 'https://oauth2.googleapis.com/token',
                'refresh_url' => 'https://oauth2.googleapis.com/token',
                'scope' => 'openid email https://www.googleapis.com/auth/drive.readonly',
                'client_id' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_GOOGLE_CLIENT_SECRET'),
                'callback_base_url' => env('CHAT_CONNECTORS_GOOGLE_CALLBACK_BASE_URL'),
                'pkce' => true, 'access_type' => 'offline', 'prompt' => 'consent',
                'refresh_fields' => ['refresh_token', 'grant_type', 'client_id', 'client_secret'],
            ],
        ],

];
