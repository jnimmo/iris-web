/* Defines the kanban board */
let note_editor;
let session_id = null ;
let collaborator = null ;
let collaborator_socket = null ;
let buffer_dumped = false ;
let last_applied_change = null ;
let just_cleared_buffer = null ;
let from_sync = null;
let is_typing = "";
let ppl_viewing = new Map();
let timer_socket = 0;
let note_id = null;
let map_notes = Object();
let last_ping = 0;
let forceModalClose = false;
let wasMiniNote = false;
let cid = null;
let previousNoteTitle = null;

const preventFormDefaultBehaviourOnSubmit = (event) => {
    event.preventDefault();
    return false;
};


function Collaborator( session_id, note_id ) {
    this.collaboration_socket = collaborator_socket;

    this.channel = "case-" + session_id + "-notes";

    this.collaboration_socket.on( "change-note", function(data) {
        if ( data.note_id !== note_id ) return ;
        let delta = JSON.parse( data.delta ) ;
        last_applied_change = delta ;
        $("#content_typing").text(data.last_change + " is typing..");
        if ( delta !== null && delta !== undefined ) {
            note_editor.session.getDocument().applyDeltas([delta]);
        }
    }.bind()) ;

    this.collaboration_socket.on( "clear_buffer-note", function() {
        if ( data.note_id !== note_id ) return ;
        just_cleared_buffer = true ;
        note_editor.setValue( "" ) ;
    }.bind() ) ;

    this.collaboration_socket.on( "save-note", function(data) {
        if ( data.note_id !== note_id ) return ;
        sync_note(note_id)
            .then(function () {
                $("#content_last_saved_by").text("Last saved by " + data.last_saved);
                $('#btn_save_note').text("Saved").addClass('btn-success').removeClass('btn-danger').removeClass('btn-warning');
                $('#last_saved').removeClass('btn-danger').addClass('btn-success');
                $('#last_saved > i').attr('class', "fa-solid fa-file-circle-check");
            });

    }.bind());

    this.collaboration_socket.on('leave-note', function(data) {
        ppl_viewing.delete(data.user);
        refresh_ppl_list(session_id, note_id);
    });

    this.collaboration_socket.on('join-note', function(data) {
        if ( data.note_id !== note_id ) return ;
        if ((data.user in ppl_viewing)) return;
        ppl_viewing.set(filterXSS(data.user), 1);
        refresh_ppl_list(session_id, note_id);
        collaborator.collaboration_socket.emit('ping-note', { 'channel': collaborator.channel, 'note_id': note_id });
    });

    this.collaboration_socket.on('ping-note', function(data) {
        if ( data.note_id !== note_id ) return ;
        collaborator.collaboration_socket.emit('pong-note', { 'channel': collaborator.channel, 'note_id': note_id });
    });

    this.collaboration_socket.on('disconnect', function(data) {
        ppl_viewing.delete(data.user);
        refresh_ppl_list(session_id, note_id);
    });

}

function set_notes_follow(data) {

    if (data.note_id !== null) {
        if (data.note_id in map_notes ) {
            map_notes[data.note_id][data.user] = 2;
        } else {
            map_notes[data.note_id] = Object();
            map_notes[data.note_id][data.user] = 2;
        }
    }

    for (let notid in map_notes) {
        for (let key in map_notes[notid]) {
            if (key !== data.user && data.note_id !== note_id || data.note_id === null) {
                map_notes[notid][key] -= 1;
            }
            if (map_notes[notid][key] < 0) {
                delete map_notes[notid][key];
            }
        }
        $(`#badge_${notid}`).empty();
        for (let key in map_notes[notid]) {
            $(`#badge_${notid}`).append(get_avatar_initials(filterXSS(key), false, undefined, true));
        }
    }

}

Collaborator.prototype.change = function( delta, note_id ) {
    this.collaboration_socket.emit( "change-note", { 'delta': delta, 'channel': this.channel, 'note_id': note_id } ) ;
}

Collaborator.prototype.clear_buffer = function( note_id ) {
    this.collaboration_socket.emit( "clear_buffer-note", { 'channel': this.channel, 'note_id': note_id } ) ;
}

Collaborator.prototype.save = function( note_id ) {
    this.collaboration_socket.emit( "save-note", { 'channel': this.channel, 'note_id': note_id } ) ;
}

Collaborator.prototype.close = function( note_id ) {
    this.collaboration_socket.emit( "leave-note", { 'channel': this.channel, 'note_id': note_id } ) ;
}

function auto_remove_typing() {
    if ($("#content_typing").text() == is_typing) {
        $("#content_typing").text("");
    } else {
        is_typing = $("#content_typing").text();
    }
}

/* Generates a global sequence id for subnotes */
let current_id = 0;

/* Generates a global sequence id for groups */
var current_gid = 0;

async function get_remote_note(note_id) {
    return get_request_api("/case/notes/" + note_id);
}

async function sync_note(node_id) {

    return;
}


/* Delete a group of the dashboard */
function delete_note(_item, cid) {

    var n_id = $("#info_note_modal_content").find('iris_notein').text();

    do_deletion_prompt("You are about to delete note #" + n_id)
    .then((doDelete) => {
        if (doDelete) {
            post_request_api('/case/notes/delete/' + n_id, null, null, cid)
            .done((data) => {
               $('#modal_note_detail').modal('hide');
               notify_auto_api(data);
            })
            .fail(function (error) {
                draw_kanban();
                swal( 'Oh no :(', error.message, 'error');
            });
        }
    });
}


/* Edit one note */
function edit_note(event) {

    var nval = $(event).find('iris_note').attr('id');
    collaborator = null;
    note_detail(nval);

}


function setSharedLink(id) {
    // Set the shared ID in the URL
    let url = new URL(window.location.href);
    url.searchParams.set('shared', id);
    window.history.replaceState({}, '', url);
}

/* Fetch the edit modal with content from server */
function note_detail(id) {

    // Set teh shared ID in the URL
    setSharedLink(id);

    let url = '/case/notes/' + id;
    get_request_api(url)
    .done((data) => {
        if (notify_auto_api(data, true)) {
            let timer;
            let timeout = 10000;
            $('#form_note').keyup(function(){
                if(timer) {
                     clearTimeout(timer);
                }
                if (ppl_viewing.size <= 1) {
                    timer = setTimeout(save_note, timeout);
                }
            });

            note_id = id;

            collaborator = new Collaborator( get_caseid(), id );

            if (note_editor !== undefined || note_editor !== null) {
                note_editor = get_new_ace_editor('editor_detail', 'note_content', 'targetDiv', function () {
                    $('#last_saved').addClass('btn-danger').removeClass('btn-success');
                    $('#last_saved > i').attr('class', "fa-solid fa-file-circle-exclamation");
                    $('#btn_save_note').text("Save").removeClass('btn-success').addClass('btn-warning').removeClass('btn-danger');
                }, save_note);
            }

            note_editor.focus();

            note_editor.setValue(data.data.note_content, -1);
            $('#currentNoteTitle').text(data.data.note_title);
            previousNoteTitle = data.data.note_title;
            $('#currentNoteIDLabel').text(`#${data.data.note_id} - ${data.data.note_uuid}`)
                .data('note_id', data.data.note_id);

            note_editor.on( "change", function( e ) {
                if( last_applied_change != e && note_editor.curOp && note_editor.curOp.command.name) {
                    collaborator.change( JSON.stringify(e), id ) ;
                }
                }, false
            );
            last_applied_change = null ;
            just_cleared_buffer = false ;

            load_menu_mod_options_modal(id, 'note', $("#note_modal_quick_actions"));

            collaborator_socket.emit('ping-note', { 'channel': 'case-' + get_caseid() + '-notes', 'note_id': note_id });

            $('#currentNoteContent').show();

            // Highlight the note in the directory
            $('.note').removeClass('note-highlight');
            $('#note-' + id).addClass('note-highlight');

        }
    });
}


async function handle_note_close(id, e) {
    note_id = null;

    if ($("#minimized_modal_box").is(":visible")) {
        forceModalClose = true;
        wasMiniNote = true;
        save_note(null, get_caseid());
    }


    if ($('#btn_save_note').text() === "Save" && !forceModalClose) {
        e.preventDefault();
        e.stopPropagation();

        swal({
            title: "Are you sure?",
            text: "You have unsaved changes!",
            icon: "warning",
            buttons: {
                cancel: {
                    text: "Cancel",
                    value: null,
                    visible: true,
                },
                confirm: {
                    text: "Discard changes",
                    value: true,
                }
            },
            dangerMode: true,
            closeOnEsc: false,
            allowOutsideClick: false,
            allowEnterKey: false
        })
        .then((willDiscard) => {
            if (willDiscard) {
                location.reload();
            } else {
                return false;
            }
        })

    } else {
        forceModalClose = false;
        if (!wasMiniNote) {
            if (collaborator) {
                collaborator.close();
            }
            if (note_editor) {
                note_editor.destroy();
            }

            if (ppl_viewing) {
                ppl_viewing.clear();
            }
        }
        collaborator_socket.off('save-note');
        collaborator_socket.off('leave-note');
        collaborator_socket.off('join-note');
        collaborator_socket.off('ping-note');
        collaborator_socket.off('disconnect');
        collaborator_socket.off('clear_buffer-note');
        collaborator_socket.off('change-note');
        collaborator_socket.emit('ping-note', {'channel': 'case-' + get_caseid() + '-notes', 'note_id': null});
        wasMiniNote = false;

        await draw_kanban();
        return true;
    }
}

function refresh_ppl_list() {
    $('#ppl_list_viewing').empty();
    for (let [key, value] of ppl_viewing) {
        $('#ppl_list_viewing').append(get_avatar_initials(key, false, undefined, true));
    }
}

/* Delete a group of the dashboard */
function search_notes() {
    var data = Object();
    data['search_term'] = $("#search_note_input").val();
    data['csrf_token'] = $("#csrf_token").val();

    post_request_api('/case/notes/search', JSON.stringify(data))
    .done((data) => {
        if (data.status == 'success') {
            $('#notes_search_list').empty();
            for (e in data.data) {
                li = `<li class="list-group-item list-group-item-action">
                <span class="name" style="cursor:pointer" title="Click to open note" onclick="note_detail(`+ data.data[e]['note_id'] +`);">`+ data.data[e]['note_title'] +`</span>
                </li>`
                $('#notes_search_list').append(li);
            }
            $('#notes_search_list').show();

        } else {
            if (data.message != "No data to load for dashboard") {
                swal("Oh no !", data.message, "error");
            }
        }
    })
}

function toggle_max_editor() {
    if ($('#container_note_content').hasClass('col-md-12')) {
        $('#container_note_content').removeClass('col-md-12').addClass('col-md-6');
        $('#ctrd_notesum').removeClass('d-none');
        $('#btn_max_editor').html('<i class="fa-solid fa-minimize"></i>');
    } else {
        $('#container_note_content').removeClass('col-md-6').addClass('col-md-12');
        $('#ctrd_notesum').addClass('d-none');
        $('#btn_max_editor').html('<i class="fa-solid fa-maximize"></i>');
    }

}

/* Save a note into db */
function save_note() {
    clear_api_error();
    let n_id = $('#currentNoteIDLabel').data('note_id')


    let data_sent = Object();
    let currentNoteTitle = $('#currentNoteTitle').text() ? $('#currentNoteTitle').text() : $('#currentNoteTitleInput').val();
    data_sent['note_title'] = currentNoteTitle;
    data_sent['csrf_token'] = $('#csrf_token').val();
    data_sent['note_content'] = $('#note_content').val();
    let ret = get_custom_attributes_fields();
    let has_error = ret[0].length > 0;
    let attributes = ret[1];

    if (has_error){return false;}

    data_sent['custom_attributes'] = attributes;

    post_request_api('/case/notes/update/'+ n_id, JSON.stringify(data_sent), false, undefined, cid, function() {
        $('#btn_save_note').text("Error saving!").removeClass('btn-success').addClass('btn-danger').removeClass('btn-danger');
        $('#last_saved > i').attr('class', "fa-solid fa-file-circle-xmark");
        $('#last_saved').addClass('btn-danger').removeClass('btn-success');
    })
    .done((data) => {
        if (data.status == 'success') {
            $('#btn_save_note').text("Saved").addClass('btn-success').removeClass('btn-danger').removeClass('btn-warning');
            $('#last_saved').removeClass('btn-danger').addClass('btn-success');
             $("#content_last_saved_by").text('Last saved by you');
            $('#last_saved > i').attr('class', "fa-solid fa-file-circle-check");
            collaborator.save(n_id);
            if (previousNoteTitle !== currentNoteTitle) {
                load_directories();
                previousNoteTitle = currentNoteTitle;
            }
        }
    });
}

/* Span for note edition */
function edit_innote() {
    return edit_inner_editor('notes_edition_btn', 'container_note_content', 'ctrd_notesum');
}

async function load_directories() {
    return get_request_api('/case/notes/directories/filter')
        .done((data) => {
            if (notify_auto_api(data, true)) {
                let directoriesListing = $('#directoriesListing');
                directoriesListing.empty();

                data.data.forEach(function(directory) {
                    directoriesListing.append(createDirectoryListItem(directory));
                });

                $('.page-aside').resizable({
                    handles: 'e, w'
                });
            }
        });
}

function download_note() {
    // Use directly the content of the note editor
    let content = note_editor.getValue();
    let filename = $('#currentNoteTitle').text() + '.md';
    let blob = new Blob([content], {type: 'text/plain'});
    let url = window.URL.createObjectURL(blob);

    // Create a link to the file and click it to download it
    let link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
}

function add_note(directory_id) {
    let data = Object();
    data['directory_id'] = directory_id;
    data['note_title'] = 'New note';
    data['note_content'] = '';
    data['csrf_token'] = $('#csrf_token').val();

    post_request_api('/case/notes/add', JSON.stringify(data))
    .done((data) => {
        if (notify_auto_api(data, true)) {
            note_detail(data.data.note_id);
            load_directories();
        }
    });
}

function createDirectoryListItem(directory) {
    // Create a list item for the directory
    var listItem = $('<li></li>');
    var link = $('<a></a>').attr('href', '#');
    var icon = $('<i></i>').addClass('fa-regular fa-folder');  // Create an icon for the directory
    link.append(icon);
    link.append(' ' + directory.name);
    link.append($('<span></span>').addClass('badge badge-light float-right').text(directory.note_count));
    listItem.append(link);

    var container = $('<div></div>').addClass('directory-container');
    listItem.append(container);

    if ((directory.subdirectories.length + directory.notes.length) > 5 || directory.notes.length > 0) {
        icon.removeClass('fa-folder').addClass('fa-folder-open');
    } else {
        container.hide();
    }

    link.on('click', function(e) {
        e.preventDefault();
        container.slideToggle();
        icon.toggleClass('fa-folder fa-folder-open');
    });

    link.on('contextmenu', function(e) {
        e.preventDefault();

        let menu = $('<div></div>').addClass('dropdown-menu show').css({
            position: 'absolute',
            left: e.pageX,
            top: e.pageY
        });

        menu.append($('<a></a>').addClass('dropdown-item').attr('href', '#').text('Add note').on('click', function(e) {
            e.preventDefault();
            add_note(directory.id);
        }));
        menu.append($('<a></a>').addClass('dropdown-item').attr('href', '#').text('Rename').on('click', function(e) {
            e.preventDefault();
        }));
        menu.append($('<a></a>').addClass('dropdown-item').attr('href', '#').text('Delete').on('click', function(e) {
            e.preventDefault();
        }));

        $('body').append(menu).on('click', function() {
            menu.remove();
        });
    });

    if (directory.subdirectories && directory.subdirectories.length > 0) {
        var subdirectoriesList = $('<ul></ul>').addClass('nav');
        directory.subdirectories.forEach(function(subdirectory) {
            subdirectoriesList.append(createDirectoryListItem(subdirectory));
        });
        container.append(subdirectoriesList);
    }


    if (directory.notes && directory.notes.length > 0) {
        var notesList = $('<ul></ul>').addClass('nav');
        directory.notes.forEach(function(note) {
            var noteListItem = $('<li></li>').attr('id', 'note-' + note.id).addClass('note');  // Add an id to the list item
            var noteLink = $('<a></a>').attr('href', '#');
            noteLink.append($('<i></i>').addClass('fa-regular fa-file'));
            noteLink.append(' ' + note.title);

            noteLink.on('click', function(e) {
                e.preventDefault();
                note_detail(note.id);

                $('.note').removeClass('note-highlight');

                noteListItem.addClass('note-highlight');
            });

            noteListItem.append(noteLink);
            notesList.append(noteListItem);
        });
        container.append(notesList);
    }

    return listItem;
}


function note_interval_pinger() {
    if (new Date() - last_ping > 2000) {
        collaborator_socket.emit('ping-note',
            { 'channel': 'case-' + get_caseid() + '-notes', 'note_id': note_id });
        last_ping = new Date();
    }
}

$(document).ready(function(){
    load_directories().then(
        function() {
            let shared_id = getSharedLink();
            if (shared_id) {
                note_detail(shared_id);
            }
        }
    )


    cid = get_caseid();
    collaborator_socket = io.connect();
    collaborator_socket.emit('join-notes-overview', { 'channel': 'case-' + cid + '-notes' });

    collaborator_socket.on('ping-note', function(data) {
        last_ping = new Date();
        if ( data.note_id === null || data.note_id !== note_id) {
            set_notes_follow(data);
            return;
        }

        ppl_viewing.set(data.user, 1);
        for (let [key, value] of ppl_viewing) {
            if (key !== data.user) {
                ppl_viewing.set(key, value-1);
            }
            if (value < 0) {
                ppl_viewing.delete(key);
            }
        }
        refresh_ppl_list(session_id, note_id);
    });

    timer_socket = setInterval( function() {
        note_interval_pinger();
    }, 2000);

    collaborator_socket.emit('ping-note', { 'channel': 'case-' + cid + '-notes', 'note_id': note_id });

    setInterval(auto_remove_typing, 1500);

    $(document).on('click', '#currentNoteTitle', function() {
        var title = $(this).text();
        $(this).replaceWith('<input id="currentNoteTitleInput" type="text" value="' + title + '">');
        $('#currentNoteTitleInput').focus();
    });

    $(document).on('blur keyup', '#currentNoteTitleInput', function(e) {
        if (e.type === 'blur' || e.key === 'Enter') {
            var title = $(this).val();
            $(this).replaceWith('<h4 class="page-title mb-0" id="currentNoteTitle">' + title + '</h4>');
            save_note();
        }
    });

});
