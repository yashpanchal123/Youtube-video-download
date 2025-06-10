$(document).ready(function() {
    const API_BASE = 'http://localhost:8000';
    let refreshInterval;

    // --- index.html logic ---
    $('#channel-form').on('submit', function(e) {
        e.preventDefault();
        const $form = $(this);
        const $submitBtn = $form.find('button[type="submit"]');
        const $fileInput = $('#file-upload');
        const $channelLink = $('#channel-link');

        // Validate input
        if (!$fileInput[0].files[0] && !$channelLink.val()) {
            showNotification('Please provide either a file or a channel link', 'error');
            return;
        }

        // Disable form and show loading
        $form.find('input, button').prop('disabled', true);
        $submitBtn.html('<span class="loading"></span> Processing...');

        const formData = new FormData();
        if ($fileInput[0].files[0]) {
            formData.append('file', $fileInput[0].files[0]);
        }
        if ($channelLink.val()) {
            formData.append('channel_link', $channelLink.val());
        }

        $.ajax({
            url: API_BASE + '/upload-channels',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                const taskId = response.task_id;
                showNotification('Upload successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'success.html?task_id=' + encodeURIComponent(taskId);
                }, 1500);
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON?.error || 'Failed to upload. Please try again.';
                showNotification(errorMsg, 'error');
                $form.find('input, button').prop('disabled', false);
                $submitBtn.html('<svg viewBox="0 0 24 24"><path d="M5 13c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7-7-3.13-7-7zm7-9C6.48 4 2 8.48 2 14c0 5.52 4.48 10 10 10s10-4.48 10-10c0-5.52-4.48-10-10-10zm-1 14h2v-2h-2v2zm0-4h2V7h-2v6z"/></svg>Next');
            }
        });
    });

    // --- channels.html logic ---
    if ($('#channels-table').length) {
        const taskId = getQueryParam('task_id');
        if (!taskId) {
            showNotification('No task ID provided', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        // Start periodic refresh
        refreshInterval = setInterval(loadChannels, 5000);
        loadChannels();

        function loadChannels() {
            $.get(API_BASE + '/channels?task_id=' + encodeURIComponent(taskId))
                .done(function(channels) {
                    renderChannels(channels);
                    updateOverallStatus(channels);
                })
                .fail(function() {
                    showNotification('Failed to load channels', 'error');
                });
        }

        function updateOverallStatus(channels) {
            const total = channels.length;
            const completed = channels.filter(c => c.status === 'completed').length;
            const failed = channels.filter(c => c.status === 'failed').length;
            const processing = channels.filter(c => c.status === 'pending').length;

            const $status = $('#overall-status');
            if (!$status.length) {
                $('.card').prepend('<div id="overall-status" class="overall-status"></div>');
            }

            let statusHtml = `
                <div class="status-summary">
                    <div class="status-item">
                        <span class="status-label">Total:</span>
                        <span class="status-value">${total}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Completed:</span>
                        <span class="status-value completed">${completed}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Processing:</span>
                        <span class="status-value processing">${processing}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Failed:</span>
                        <span class="status-value failed">${failed}</span>
                    </div>
                </div>
            `;

            if (completed === total) {
                statusHtml += '<div class="completion-message">All channels processed successfully!</div>';
                clearInterval(refreshInterval);
            }

            $('#overall-status').html(statusHtml);
        }

        function renderChannels(channels) {
            const icons = {
                pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fbbf24"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
                failed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ef4444"/><path d="M9 9l6 6M15 9l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
                completed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M8 12l2.5 2.5L16 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
                retry: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 7l5 5V8c3.31 0 6 2.69 6 6 0 1.3-.42 2.5-1.13 3.47l1.46 1.46C19.07 17.03 20 15.13 20 13c0-4.42-3.58-8-8-8z" fill="#fff"/></svg>'
            };

            const $tbody = $('#channels-table tbody');
            $tbody.empty();

            channels.forEach(function(ch) {
                const row = `
                    <tr data-uuid="${ch.uuid}" class="channel-row ${ch.status}">
                        <td>${ch.name}</td>
                        <td>
                            <span class="status-badge status-${ch.status}">
                                ${icons[ch.status]}${ch.status}
                            </span>
                        </td>
                        <td>
                            ${ch.status === 'failed' ? 
                                `<button class="btn retry-channel" data-uuid="${ch.uuid}">
                                    ${icons.retry} Retry
                                </button>` : 
                                ''}
                        </td>
                    </tr>
                `;
                $tbody.append(row);
            });
        }

        // Row click handler
        $('#channels-table tbody').on('click', 'tr.channel-row', function(e) {
            if ($(e.target).closest('.retry-channel').length) return;
            
            const uuid = $(this).data('uuid');
            const $row = $(this);
            
            $row.addClass('loading');
            $.get(API_BASE + '/task/' + taskId + '/channels/' + uuid + '/videos')
                .done(function(videos) {
                    sessionStorage.setItem('currentChannel', uuid);
                    sessionStorage.setItem('currentTask', taskId);
                    sessionStorage.setItem('videos', JSON.stringify(videos));
                    window.location.href = 'videos.html';
                })
                .fail(function() {
                    showNotification('Failed to load videos', 'error');
                    $row.removeClass('loading');
                });
        });

        // Retry button handler
        $('#channels-table tbody').on('click', '.retry-channel', function(e) {
            e.stopPropagation();
            const $btn = $(this);
            const uuid = $btn.data('uuid');
            
            $btn.prop('disabled', true).html('<span class="loading"></span>');
            
            $.post(API_BASE + '/channels/' + uuid + '/retry')
                .done(function() {
                    showNotification('Retry initiated', 'success');
                    loadChannels();
                })
                .fail(function() {
                    showNotification('Failed to retry', 'error');
                    $btn.prop('disabled', false).html(`${icons.retry} Retry`);
                });
        });
    }

    // --- videos.html logic ---
    if ($('#videos-table').length) {
        const channelUuid = sessionStorage.getItem('currentChannel');
        const taskId = sessionStorage.getItem('currentTask');

        if (!channelUuid || !taskId) {
            showNotification('Session expired', 'error');
            setTimeout(() => window.location.href = 'channels.html', 2000);
            return;
        }

        // Start periodic refresh
        refreshInterval = setInterval(loadVideos, 5000);
        loadVideos();

        function loadVideos() {
            $.get(API_BASE + '/task/' + taskId + '/channels/' + channelUuid + '/videos')
                .done(function(videos) {
                    console.log('Received videos data:', videos);
                    sessionStorage.setItem('videos', JSON.stringify(videos));
                    renderVideos(videos);
                    updateVideoStatus(videos);
                })
                .fail(function() {
                    showNotification('Failed to load videos', 'error');
                });
        }

        function updateVideoStatus(videos) {
            const total = videos.length;
            const completed = videos.filter(v => v.status === 'completed').length;
            const failed = videos.filter(v => v.status === 'failed').length;
            const processing = videos.filter(v => v.status === 'pending').length;

            const $status = $('#video-status');
            if (!$status.length) {
                $('.card').prepend('<div id="video-status" class="overall-status"></div>');
            }

            let statusHtml = `
                <div class="status-summary">
                    <div class="status-item">
                        <span class="status-label">Total Videos:</span>
                        <span class="status-value">${total}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Completed:</span>
                        <span class="status-value completed">${completed}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Processing:</span>
                        <span class="status-value processing">${processing}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Failed:</span>
                        <span class="status-value failed">${failed}</span>
                    </div>
                </div>
            `;

            if (completed === total) {
                statusHtml += '<div class="completion-message">All videos processed successfully!</div>';
                clearInterval(refreshInterval);
            }

            $('#video-status').html(statusHtml);
        }

        function renderVideos(videos) {
            const icons = {
                pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fbbf24"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
                failed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ef4444"/><path d="M9 9l6 6M15 9l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
                completed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M8 12l2.5 2.5L16 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
                retry: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 7l5 5V8c3.31 0 6 2.69 6 6 0 1.3-.42 2.5-1.13 3.47l1.46 1.46C19.07 17.03 20 15.13 20 13c0-4.42-3.58-8-8-8z" fill="#fff"/></svg>'
            };

            const $tbody = $('#videos-table tbody');
            $tbody.empty();

            videos.forEach(function(v) {
                const row = `
                    <tr class="video-row ${v.status}">
                        <td>
                            <a href="${v.video_link}" target="_blank" class="video-link">
                                ${v.video_link}
                            </a>
                        </td>
                        <td>
                            <span class="status-badge status-${v.status}">
                                ${icons[v.status]}${v.status}
                            </span>
                        </td>
                        <td>
                            ${v.s3_path ? 
                                `<span class="s3-path">${v.s3_path}</span>` : 
                                '-'}
                        </td>
                        <td>
                            ${v.status === 'failed' ? 
                                `<button class="btn retry-video" data-uuid="${v.uuid}">
                                    ${icons.retry} Retry
                                </button>` : 
                                ''}
                        </td>
                    </tr>
                `;
                $tbody.append(row);
            });
        }

        // Retry button handler
        $('#videos-table tbody').on('click', '.retry-video', function(e) {
            e.stopPropagation();
            const $btn = $(this);
            const uuid = $btn.data('uuid');
            
            $btn.prop('disabled', true).html('<span class="loading"></span>');
            
            $.post(API_BASE + '/videos/' + uuid + '/retry')
                .done(function() {
                    showNotification('Retry initiated', 'success');
                    loadVideos();
                })
                .fail(function() {
                    showNotification('Failed to retry', 'error');
                    $btn.prop('disabled', false).html(`${icons.retry} Retry`);
                });
        });
    }

    // Utility functions
    function getQueryParam(name) {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    }

    function showNotification(message, type = 'info') {
        const $notification = $('<div>')
            .addClass('notification')
            .addClass(type)
            .text(message)
            .appendTo('body');

        setTimeout(() => {
            $notification.fadeOut(() => $notification.remove());
        }, 3000);
    }
}); 