/* Defines the kanban board */
let note_editor;
let session_id = null ;
let collaborator = null ;
let buffer_dumped = false ;
let last_applied_change = null ;
let just_cleared_buffer = null ;
let from_sync = null;
let is_typing = "";
let ppl_viewing = [];

const preventFormDefaultBehaviourOnSubmit = (event) => {
    event.preventDefault();
    return false;
};

var boardNotes = {
    init: function init() {
        this.bindUIActions();
    },
    bindUIActions: function bindUIActions() {
        // event handlers
        this.handleBoardStyle();
        this.handleSortable();
    },
    byId: function byId(id) {
        return document.getElementById(id);
    },
    handleBoardStyle: function handleBoardStyle() {
        $(document).on('mouseenter mouseleave', '.kanban-board-header', function (e) {
            var isHover = e.type === 'mouseenter';
            $(this).parent().toggleClass('hover', isHover);
        });
    },
    handleSortable: function handleSortable() {
        var board = this.byId('myKanban');
        // Multi groups
        Sortable.create(board, {
            animation: 150,
            draggable: '.kanban-board',
            handle: '.kanban-board-header',
            filter: '.ignore-sort',
            forceFallback: true
        });
        [].forEach.call(board.querySelectorAll('.kanban-drag'), function (el) {
            Sortable.create(el, {
                group: 'tasks',
                animation: 150,
                filter: '.ignore-sort',
                forceFallback: true
            });
        });
    }
};

function Collaborator( session_id, note_id ) {
    this.collaboration_socket = io.connect() ;

    this.channel = "case-" + session_id + "-note-" + note_id ;
    this.collaboration_socket.emit('join-note', { 'channel': this.channel });

    this.collaboration_socket.on( "change-note", function(data) {
        let delta = JSON.parse( data.delta ) ;
        last_applied_change = delta ;
        $("#content_typing").text(data.last_change + " is typing..");
        note_editor.getSession().getDocument().applyDeltas( [delta] ) ;
    }.bind() ) ;

    this.collaboration_socket.on( "clear_buffer-note", function() {
        just_cleared_buffer = true ;
        console.log( "setting editor empty" ) ;
        note_editor.setValue( "" ) ;
    }.bind() ) ;

    this.collaboration_socket.on( "save-note", function(data) {
        sync_note(note_id)
            .then(function () {
                $("#content_last_saved_by").text("Last saved by " + data.last_saved);
                $('#btn_save_note').text("Saved").addClass('btn-success').removeClass('btn-danger').removeClass('btn-warning');
                $('#last_saved').removeClass('btn-danger').addClass('btn-success');
                $('#last_saved > i').attr('class', "fa-solid fa-file-circle-check");
            });

    }.bind());

    this.collaboration_socket.on('leave-note', function(data) {
        console.l
    });
}

Collaborator.prototype.change = function( delta ) {
    this.collaboration_socket.emit( "change-note", { 'delta': delta, 'channel': this.channel } ) ;
}

Collaborator.prototype.clear_buffer = function() {
    this.collaboration_socket.emit( "clear_buffer-note", { 'channel': this.channel } ) ;
}

Collaborator.prototype.save = function() {
    this.collaboration_socket.emit( "save-note", { 'channel': this.channel } ) ;
}

Collaborator.prototype.close = function() {
    this.collaboration_socket.emit( "leave-note", { 'channel': this.channel } ) ;
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

function nextSubNote(element, _item, title) {
    var newElement = element.clone();
    var id = current_id + 1;
    current_id = id;
    if (id < 10) id = "0" + id;
    newElement.attr("id", element.attr("id").split("_")[0] + "_" + id);
    var field = $(newElement).attr("id");
    $(newElement).attr("id", field.split("_")[0] + "_" + id);
    $(newElement).find('iris_note').attr('id', 'xqx'  + id + 'qxq');
    $(newElement).find('iris_note').text("New note");
    var va = $(newElement).find('a');
    $(newElement).find(va[1]).attr("onclick", 'delete_note("_' + id + '")');
    newElement.appendTo($('#group-' + _item + "_main"));
    newElement.show();
}

/* Generates a global sequence id for groups */
var current_gid = 0;

async function get_remote_note(note_id) {
    get_request_api("/case/notes/" + note_id)
    .then(function (data) {
        if (notify_auto_api(data, true)) {
            return data.data;
        }
    });
}

async function sync_note(node_id) {
    let note = await get_remote_note(node_id);
    if (note == null) {
        return;
    }

    let note_content = note.content;
    note_editor.setValue(note_content);
    return note;
}

function nextGroupNote(title="", rid=0) {

    if (rid == 0) {
        console.log("RID is needed to create group");
        return;
    }

    var element = $('#group_');
    var newElement = element.clone();

    if (title == "") {
        title = "Untitled group";
    }
    newElement.attr("id", "group-" + rid);
    newElement.attr("title", "Group ID #" + rid);

    var fa = $(newElement).find('button')[0];
    var fb = $(newElement).find('button')[1];
    var va = $(newElement).find('a');

    $(newElement).find('div.kanban-title-board').text(title);
    $(newElement).find('div.kanban-title-board').attr("onclick", 'edit_add_save(' + rid + ')');

    $(newElement).find(fa).attr("onclick", 'edit_remote_groupnote(' + rid + ')');
    $(newElement).find(fb).attr("onclick", 'add_remote_note(' + rid + ')');

    $(newElement).find(va[0]).attr("onclick", 'delete_remote_groupnote(' + rid + ')');

    $(newElement).find('main').attr("id", "group-" + rid + "-main");
    newElement.appendTo($('#myKanban'));
    newElement.show();

    return rid;
}

/* Add a subnote to an item */
function add_subnote(_item, tr=0, title='', last_up, user) {

    if (tr != 0) {
        element = $('#_subnote_');
        var newElement = element.clone();
        var id = tr;
        current_id = id;

        info = user + " on " + last_up.replace('GMT', '');

        newElement.attr("id", element.attr("id").split("_")[0] + "_" + id);
        var field = $(newElement).attr("id");
        $(newElement).attr("id", field.split("_")[0] + "_" + id);
        $(newElement).attr("title", 'Note #' + id);
        $(newElement).find('iris_note').attr('id', tr);
        $(newElement).find('iris_note').text(title);
        $(newElement).find('a.kanban-title').text(title);
        $(newElement).find('small.kanban-info').text(info);
        $(newElement).find('div.kanban-badges').remove();
        newElement.appendTo($('#group-' + _item + "-main"));
        newElement.show();
    }
}

/* Add a group to the dashboard */
function add_groupnote(title="", rid=0) {
    return nextGroupNote(title, rid=rid);
}

/* Add a remote note to a group */
function add_remote_note(group_id) {
        caseid = get_caseid();
        var data = Object();
        data['note_title'] = "Untitled note";
        data['note_content'] = "";

        data['group_id'] = group_id;
        data['csrf_token'] = $('#csrf_token').val();

        post_request_api('/case/notes/add', JSON.stringify(data), false)
        .done((data) => {
            if (data.status == 'success') {
                draw_kanban();
            } else {
                if (data.message != "No data to load for dashboard") {
                    swal("Oh no !", data.message, "error");
                }
            }
        })

}

/* Add a group note remotely */
function add_remote_groupnote() {
    var data = Object();
    data['csrf_token'] = $('#csrf_token').val();

    post_request_api('/case/notes/groups/add', JSON.stringify(data), false)
    .done((data) => {
        if (data.status == 'success') {
            nextGroupNote(data.data.group_title, data.data.group_id);
            draw_kanban();
        } else {
            if (data.message != "No data to load for dashboard") {
                swal("Oh no !", data.message, "error");
            }
        }
    })
}

/* Delete a group of the dashboard */
function delete_remote_groupnote(group_id) {

    swal({
      title: "Attention ",
      text: "All the notes in this group will be deleted !\nThis cannot be reverted, notes will not be recoverable",
      icon: "warning",
      buttons: true,
      dangerMode: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    })
    .then((willDelete) => {
      if (willDelete) {
        var data = Object();
        data['group_id'] = group_id;
        data['csrf_token'] = $('#csrf_token').val();

        post_request_api('/case/notes/groups/delete/'+ group_id)
        .done((data) => {
            if (data.status == 'success') {
                swal("Done !", data.message, "success");
                draw_kanban();
            } else {
                if (data.message != "No data to load for dashboard") {
                    swal("Oh no !", data.message, "error");
                }
            }
        })
      } else {
        swal("Pfew, that was close");
      }
    });

}

/* Add a button to save group name */
function edit_add_save(group_id) {
    btn = $("#group-" + group_id).find('button')[0];
    $(btn).show();
}

/* Delete a group of the dashboard */
function edit_remote_groupnote(group_id) {

    var data = Object();
    data['group_title'] = $("#group-" + group_id).find('div.kanban-title-board').text();
    data["csrf_token"] = $('#csrf_token').val();

    post_request_api('/case/notes/groups/update/'+ group_id, JSON.stringify(data))
    .done((data) => {
        notify_auto_api(data);
        draw_kanban();
    })
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

/* List all the notes on the dashboard */
function list_notes() {
    output = {};
    $("#myKanban").children().each(function () {

        gid = $(this).attr('id');

        output[gid] = [];

        $(this).find('iris_note').each(function () {
            output[gid].push(
                [$(this).attr('id'),
                $(this).text()
            ]);
        })

    });

    return output;

}

/* Edit one note */
function edit_note(event) {

    var nval = $(event).find('iris_note').attr('id');
    collaborator = null;
    note_detail(nval);

}

/* On modal close, refresh */
$('#modal_note_detail').on('hidden.bs.modal', function (e) {
    if (window.location.pathname.includes('/case/notes')) {
        draw_kanban();
    }
  })


/* Fetch the edit modal with content from server */
function note_detail(id, cid) {
    if (cid === undefined ) {
        cid = case_param()
    } else {
        cid = '?cid=' + cid;
    }

    url = '/case/notes/' + id + "/modal" + cid;
    $('#info_note_modal_content').load(url, function (response, status, xhr) {
        $('#form_note').on("submit", preventFormDefaultBehaviourOnSubmit);
        hide_minimized_modal_box();
        if (status !== "success") {
             ajax_notify_error(xhr, url);
             return false;
        }

        var timer;
        var timeout = 10000;
        $('#form_note').keyup(function(){
            if(timer) {
                 clearTimeout(timer);
            }
            timer = setTimeout(save_note, timeout);
        });

        collaborator = new Collaborator( get_caseid(), id );

        note_editor = get_new_ace_editor('editor_detail', 'note_content', 'targetDiv', function() {
            $('#last_saved').addClass('btn-danger').removeClass('btn-success');
            $('#last_saved > i').attr('class', "fa-solid fa-file-circle-exclamation");
            $('#btn_save_note').text("Unsaved").removeClass('btn-success').addClass('btn-warning').removeClass('btn-danger');
        }, save_note);

        note_editor.focus();

        note_editor.on( "change", function( e ) {
            // TODO, we could make things more efficient and not likely to conflict by keeping track of change IDs
            if( last_applied_change != e && note_editor.curOp && note_editor.curOp.command.name) {
                collaborator.change( JSON.stringify(e) ) ;
            }
            }, false
        );
        last_applied_change = null ;
        just_cleared_buffer = false ;

        load_menu_mod_options_modal(id, 'note', $("#note_modal_quick_actions"));
        $('#modal_note_detail').modal({ show: true, backdrop: 'static', keyboard: false });

        $('#modal_note_detail').on("hidden.bs.modal", function () {
            handle_note_close(id);
        });

    });
}

function handle_note_close(id) {
    if (collaborator) {
        collaborator.close();
    }
    if (note_editor) {
        note_editor.destroy();
    }
}

function handle_ed_paste(event) {
    filename = null;
    const { items } = event.originalEvent.clipboardData;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];

      if (item.kind === 'string') {
        item.getAsString(function (s){
            filename = $.trim(s.replace(/\t|\n|\r/g, '')).substring(0, 40);
        });
      }

      if (item.kind === 'file') {
        console.log(item.type);
        const blob = item.getAsFile();

        if (blob !== null) {
            const reader = new FileReader();
            reader.onload = (e) => {
                notify_success('The file is uploading in background. Don\'t leave the page');

                if (filename === null) {
                    filename = random_filename(25);
                }

                upload_interactive_data(e.target.result, filename, function(data){
                    url = data.data.file_url + case_param();
                    event.preventDefault();
                    note_editor.insertSnippet(`\n![${filename}](${url} =40%x40%)\n`);
                });

            };
            reader.readAsDataURL(blob);
        } else {
            notify_error('Unsupported direct paste of this item. Use datastore to upload.');
        }
      }
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
function save_note(this_item, cid) {
    clear_api_error();
    var n_id = $("#info_note_modal_content").find('iris_notein').text();


    var data_sent = $('#form_note').serializeObject();
    data_sent['note_content'] = $('#note_content').val();
    ret = get_custom_attributes_fields();
    has_error = ret[0].length > 0;
    attributes = ret[1];

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
            collaborator.save();
        }
    });
}

/* Span for note edition */
function edit_innote() {
    return edit_inner_editor('notes_edition_btn', 'container_note_content', 'ctrd_notesum');
}

/* Load the kanban case data and build the board from it */
function draw_kanban() {
    /* Empty board */
    $('#myKanban').empty();
    show_loader();

    $.ajax({
        url: '/case/notes/groups/list' + case_param(),
        type: "GET",
        dataType: 'JSON',
        success: function (data) {
            if (data.status == 'success') {
                gidl = [];
                if (data.data.groups.length > 0) {
                    $('#empty-set-notes').hide();
                } else {
                    $('#empty-set-notes').show();
                }
                for (idx in data.data.groups) {
                    group = data.data.groups[idx];
                    if (!gidl.includes(group.group_id)) {
                        nextGroupNote(group.group_title, group.group_id);
                        gidl.push(group.group_id);
                    }
                    for  (ikd in group.notes) {
                        note = group.notes[ikd];
                        add_subnote(group.group_id,
                                note.note_id,
                                note.note_title,
                                note.note_lastupdate,
                                note.user
                            );
                    }
                }
            set_last_state(data.data.state);
            hide_loader();
            } else {
                if (data.message != "No data to load for dashboard") {
                    swal("Oh no !", data.message, "error");
                }
            }
        },
        error: function (error) {
            swal("Oh no !", error, "error");
        }
    });
}

$(document).ready(function(){
    shared_id = getSharedLink();
    if (shared_id) {
        note_detail(shared_id);
    }
    setInterval(auto_remove_typing, 1500);

});
