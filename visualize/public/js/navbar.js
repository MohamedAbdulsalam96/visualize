// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide("frappe.ui.toolbar");
frappe.provide("frappe.search");

frappe.ui.toolbar.Toolbar = class {
    constructor() {
        $("header").replaceWith(
            frappe.render_template("navbar", {
                avatar: frappe.avatar(frappe.session.user, "avatar-medium"),
                navbar_settings: frappe.boot.navbar_settings,
            })
        );
        $(".dropdown-toggle").dropdown();

        this.setup_menus();
        this.setup_awesomebar();
        this.setup_notifications();
        this.setup_help();
        this.make();
    }

    async setup_menus(reload) {
        this.sidebar_pages = await this.get_menus();
        this.cached_pages = $.extend(true, {}, this.sidebar_pages);
        this.all_pages = this.sidebar_pages.pages;
        this.has_access = this.sidebar_pages.has_access;

        this.all_pages.forEach((page) => {
            page.is_editable = !page.public || this.has_access;
        });

        this.public_pages = this.all_pages.filter((page) => page.public);
        this.private_pages = this.all_pages.filter((page) => !page.public);

        console.log(this.public_pages);

        if (this.all_pages) {
            frappe.workspaces = {};
            for (let page of this.all_pages) {
                frappe.workspaces[frappe.router.slug(page.name)] = { title: page.title };
            }
            this.make_menu(this.public_pages);
            reload && this.show();
        }
    }

    get_menus() {
        return frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items");
    }

    // make menu html and append to navbar (header)
    make_menu(data) {
        // finde element with class navbar-collapse then create div element with class custom-navbar and append to it
        let custom_navbar = $('<div class="custom-navbar"></div>');
        // append to navbar-collapse element
        $(".navbar-collapse").prepend(custom_navbar);
        let menu = this.build_menu(data);
        $(".custom-navbar").append(menu);
    }

    build_menu(pages) {
        let menu = $('<ul class="navbar-default navbar-nav"></ul>');
        let is_current_page = frappe.router.slug(this.get_page_to_show().name);
        // create style for current page

        pages.forEach((item) => {
            let menuList = $(`
				<li class="nav-item ${is_current_page == frappe.router.slug(item.name) ? 'active' : ''}">
					<a class="nav-link" href="/app/${frappe.router.slug(item.title)}"></a>
				</li>`
            );
            let a = menuList.find("a");
            a.html(item.title);
            menu.append(menuList);
        });
        return menu;
    }

    show() {
        if (!this.all_pages) {
            // pages not yet loaded, call again after a bit
            setTimeout(() => this.show(), 100);
            return;
        }

        let page = this.get_page_to_show();
        this.page.set_title(__(page.name));

        this.update_selected_sidebar(this.current_page, false); //remove selected from old page
        this.update_selected_sidebar(page, true); //add selected on new page

        this.show_page(page);
    }

    get_page_to_show() {
        let default_page;

        if (
            localStorage.current_page &&
            this.all_pages.filter((page) => page.title == localStorage.current_page).length != 0
        ) {
            default_page = {
                name: localStorage.current_page,
                public: localStorage.is_current_page_public == "true",
            };
        } else if (Object.keys(this.all_pages).length !== 0) {
            default_page = { name: this.all_pages[0].title, public: true };
        } else {
            default_page = { name: "Build", public: true };
        }

        let page =
            (frappe.get_route()[1] == "private" ? frappe.get_route()[2] : frappe.get_route()[1]) ||
            default_page.name;
        let is_public = frappe.get_route()[1]
            ? frappe.get_route()[1] != "private"
            : default_page.public;
        return { name: page, public: is_public };
    }

    update_selected_sidebar(page, add) {
        let section = page.public ? "public" : "private";
        if (
            this.sidebar &&
            this.sidebar_items[section] &&
            this.sidebar_items[section][page.name]
        ) {
            let $sidebar = this.sidebar_items[section][page.name];
            let pages = page.public ? this.public_pages : this.private_pages;
            let sidebar_page = pages.find((p) => p.title == page.name);

            if (add) {
                $sidebar[0].firstElementChild.classList.add("active");
                if (sidebar_page) sidebar_page.selected = true;

                // open child sidebar section if closed
                $sidebar.parent().hasClass("hidden") && $sidebar.parent().removeClass("hidden");

                this.current_page = { name: page.name, public: page.public };
                localStorage.current_page = page.name;
                localStorage.is_current_page_public = page.public;
            } else {
                $sidebar[0].firstElementChild.classList.remove("selected");
                if (sidebar_page) sidebar_page.selected = false;
            }
        }
    }

    make() {
        this.bind_events();
        $(document).trigger("toolbar_setup");
    }

    bind_events() {
        // clear all custom menus on page change
        $(document).on("page-change", function () {
            $("header .navbar .custom-menu").remove();
        });

        //focus search-modal on show in mobile view
        $("#search-modal").on("shown.bs.modal", function () {
            var search_modal = $(this);
            setTimeout(function () {
                search_modal.find("#modal-search").focus();
            }, 300);
        });
        $(".navbar-toggle-full-width").click(() => {
            frappe.ui.toolbar.toggle_full_width();
        });
    }

    setup_help() {
        if (!frappe.boot.desk_settings.notifications) {
            // hide the help section
            $(".navbar .vertical-bar").removeClass("d-sm-block");
            $(".dropdown-help").removeClass("d-lg-block");
            return;
        }
        frappe.provide("frappe.help");
        frappe.help.show_results = show_results;

        this.search = new frappe.search.SearchDialog();
        frappe.provide("frappe.searchdialog");
        frappe.searchdialog.search = this.search;

        $(".dropdown-help .dropdown-toggle").on("click", function () {
            $(".dropdown-help input").focus();
        });

        $(".dropdown-help .dropdown-menu").on("click", "input, button", function (e) {
            e.stopPropagation();
        });

        $("#input-help").on("keydown", function (e) {
            if (e.which == 13) {
                $(this).val("");
            }
        });

        $(document).on("page-change", function () {
            var $help_links = $(".dropdown-help #help-links");
            $help_links.html("");

            var route = frappe.get_route_str();
            var breadcrumbs = route.split("/");

            var links = [];
            for (var i = 0; i < breadcrumbs.length; i++) {
                var r = route.split("/", i + 1);
                var key = r.join("/");
                var help_links = frappe.help.help_links[key] || [];
                links = $.merge(links, help_links);
            }

            if (links.length === 0) {
                $help_links.next().hide();
            } else {
                $help_links.next().show();
            }

            for (var i = 0; i < links.length; i++) {
                var link = links[i];
                var url = link.url;
                $("<a>", {
                    href: url,
                    class: "dropdown-item",
                    text: __(link.label),
                    target: "_blank",
                }).appendTo($help_links);
            }

            $(".dropdown-help .dropdown-menu").on("click", "a", show_results);
        });

        var $result_modal = frappe.get_modal("", "");
        $result_modal.addClass("help-modal");

        $(document).on("click", ".help-modal a", show_results);

        function show_results(e) {
            //edit links
            var href = e.target.href;
            if (href.indexOf("blob") > 0) {
                window.open(href, "_blank");
            }
            var path = $(e.target).attr("data-path");
            if (path) {
                e.preventDefault();
            }
        }
    }

    setup_awesomebar() {
        if (frappe.boot.desk_settings.search_bar) {
            let awesome_bar = new frappe.search.AwesomeBar();
            awesome_bar.setup("#navbar-search");

            // TODO: Remove this in v14
            frappe.search.utils.make_function_searchable(function () {
                frappe.set_route("List", "Client Script");
            }, __("Custom Script List"));
        }
    }

    setup_notifications() {
        if (frappe.boot.desk_settings.notifications && frappe.session.user !== "Guest") {
            this.notifications = new frappe.ui.Notifications();
        }
    }
};

$.extend(frappe.ui.toolbar, {
    add_dropdown_button: function (parent, label, click, icon) {
        var menu = frappe.ui.toolbar.get_menu(parent);
        if (menu.find("li:not(.custom-menu)").length && !menu.find(".divider").length) {
            frappe.ui.toolbar.add_menu_divider(menu);
        }

        return $(
            '<li class="custom-menu"><a><i class="fa-fw ' + icon + '"></i> ' + label + "</a></li>"
        )
            .insertBefore(menu.find(".divider"))
            .find("a")
            .click(function () {
                click.apply(this);
            });
    },
    get_menu: function (label) {
        return $("#navbar-" + label.toLowerCase());
    },
    add_menu_divider: function (menu) {
        menu = typeof menu == "string" ? frappe.ui.toolbar.get_menu(menu) : menu;

        $('<li class="divider custom-menu"></li>').prependTo(menu);
    },
    add_icon_link(route, icon, index, class_name) {
        let parent_element = $(".navbar-right").get(0);
        let new_element = $(`<li class="${class_name}">
			<a class="btn" href="${route}" title="${frappe.utils.to_title_case(
            class_name,
            true
        )}" aria-haspopup="true" aria-expanded="true">
				<div>
					<i class="octicon ${icon}"></i>
				</div>
			</a>
		</li>`).get(0);

        parent_element.insertBefore(new_element, parent_element.children[index]);
    },
    toggle_full_width() {
        let fullwidth = JSON.parse(localStorage.container_fullwidth || "false");
        fullwidth = !fullwidth;
        localStorage.container_fullwidth = fullwidth;
        frappe.ui.toolbar.set_fullwidth_if_enabled();
        $(document.body).trigger("toggleFullWidth");
    },
    set_fullwidth_if_enabled() {
        let fullwidth = JSON.parse(localStorage.container_fullwidth || "false");
        $(document.body).toggleClass("full-width", fullwidth);
    },
    show_shortcuts(e) {
        e.preventDefault();
        frappe.ui.keys.show_keyboard_shortcut_dialog();
        return false;
    },
});

frappe.ui.toolbar.clear_cache = frappe.utils.throttle(function () {
    frappe.assets.clear_local_storage();
    frappe.xcall("frappe.sessions.clear").then((message) => {
        frappe.show_alert({
            message: message,
            indicator: "info",
        });
        location.reload(true);
    });
}, 10000);

frappe.ui.toolbar.show_about = function () {
    try {
        frappe.ui.misc.about();
    } catch (e) {
        console.log(e);
    }
    return false;
};

frappe.ui.toolbar.route_to_user = function () {
    frappe.set_route("Form", "User", frappe.session.user);
};

frappe.ui.toolbar.view_website = function () {
    let website_tab = window.open();
    website_tab.opener = null;
    website_tab.location = "/index";
};

frappe.ui.toolbar.setup_session_defaults = function () {
    let fields = [];
    frappe.call({
        method: "frappe.core.doctype.session_default_settings.session_default_settings.get_session_default_values",
        callback: function (data) {
            fields = JSON.parse(data.message);
            let perms = frappe.perm.get_perm("Session Default Settings");
            //add settings button only if user is a System Manager or has permission on 'Session Default Settings'
            if (in_list(frappe.user_roles, "System Manager") || perms[0].read == 1) {
                fields[fields.length] = {
                    fieldname: "settings",
                    fieldtype: "Button",
                    label: __("Settings"),
                    click: () => {
                        frappe.set_route(
                            "Form",
                            "Session Default Settings",
                            "Session Default Settings"
                        );
                    },
                };
            }
            frappe.prompt(
                fields,
                function (values) {
                    //if default is not set for a particular field in prompt
                    fields.forEach(function (d) {
                        if (!values[d.fieldname]) {
                            values[d.fieldname] = "";
                        }
                    });
                    frappe.call({
                        method: "frappe.core.doctype.session_default_settings.session_default_settings.set_session_default_values",
                        args: {
                            default_values: values,
                        },
                        callback: function (data) {
                            if (data.message == "success") {
                                frappe.show_alert({
                                    message: __("Session Defaults Saved"),
                                    indicator: "green",
                                });
                                frappe.ui.toolbar.clear_cache();
                            } else {
                                frappe.show_alert({
                                    message: __(
                                        "An error occurred while setting Session Defaults"
                                    ),
                                    indicator: "red",
                                });
                            }
                        },
                    });
                },
                __("Session Defaults"),
                __("Save")
            );
        },
    });
};
