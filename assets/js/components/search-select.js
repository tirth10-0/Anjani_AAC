/**
 * UniversalSearchSelect
 * Production-grade, portal-based unified dropdown system for all ERP pages.
 * Ensures consistent 40px height, 8px radius, Inter typography, brand green accent,
 * strict viewport boundaries on mobile, upward flipping, and smooth option scrolling.
 */

class UniversalSearchSelect {
    static portal = null;
    static activeInstance = null;
    static _globalListenersAttached = false;

    constructor(element, options = {}) {
        this.select = typeof element === 'string' ? document.getElementById(element) : element;
        if (!this.select) return;
        if (this.select.getAttribute('data-native') === 'true' || this.select.closest('#root')) {
            return;
        }
        this.select._ussInstance = this;

        const firstOpt = this.select.options[0];
        const defaultPlaceholder = (firstOpt && !firstOpt.value) ? firstOpt.textContent.trim() : 'Select...';

        this.options = {
            placeholder: this.select.dataset.placeholder || defaultPlaceholder,
            allowCustom: this.select.dataset.allowCustom === 'true' || options.allowCustom || false,
            onSelect: options.onSelect || null,
            ...options
        };

        this.data = this._extractData();
        this.filteredData = [...this.data];
        this.isOpen = false;
        
        this._init();
    }

    _extractData() {
        return Array.from(this.select.options).map((opt, idx) => ({
            value: opt.value,
            text: opt.dataset.name || opt.textContent.trim(),
            category: opt.dataset.category || opt.dataset.subtext || '',
            isPlaceholder: idx === 0 && !opt.value && (
                opt.textContent.toLowerCase().includes('select') ||
                opt.textContent.toLowerCase().includes('choose') ||
                opt.textContent.toLowerCase().includes('add')
            )
        })).filter(opt => !opt.isPlaceholder);
    }

    _init() {
        // Remove only this select's prior sibling container if re-initializing
        if (this.select.parentNode) {
            const priorContainer = (this.select.previousElementSibling && this.select.previousElementSibling.classList.contains('uss-container'))
                ? this.select.previousElementSibling
                : (this.select.id ? this.select.parentNode.querySelector(`:scope > .uss-container[data-source-id="${this.select.id}"]`) : null);
            if (priorContainer) {
                priorContainer.remove();
            }
        }

        // Create container and input wrapper
        this.container = document.createElement('div');
        this.container.className = 'uss-container';

        // Inherit layout and dimensions from the source select
        if (this.select.style.width) this.container.style.width = this.select.style.width;
        if (this.select.style.minWidth) this.container.style.minWidth = this.select.style.minWidth;
        if (this.select.style.maxWidth) this.container.style.maxWidth = this.select.style.maxWidth;
        if (this.select.style.flex) this.container.style.flex = this.select.style.flex;
        if (this.select.style.flexGrow) this.container.style.flexGrow = this.select.style.flexGrow;
        if (this.select.style.flexShrink) this.container.style.flexShrink = this.select.style.flexShrink;
        if (this.select.style.margin) this.container.style.margin = this.select.style.margin;
        if (this.select.style.marginLeft) this.container.style.marginLeft = this.select.style.marginLeft;
        if (this.select.style.marginRight) this.container.style.marginRight = this.select.style.marginRight;

        if (this.select.classList.contains('erp-filter-select')) {
            this.container.classList.add('erp-filter-select-wrap');
        }
        if (this.select.classList.contains('form-select-sm')) {
            this.container.classList.add('form-select-sm');
        }
        if (this.select.id) {
            this.container.dataset.sourceId = this.select.id;
        }
        
        this.inputWrapper = document.createElement('div');
        this.inputWrapper.className = 'uss-input-wrapper';
        
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'uss-input';
        if (this.select.classList.contains('erp-filter-select')) {
            this.input.classList.add('erp-filter-select');
        }
        if (this.select.classList.contains('form-select-sm')) {
            this.input.classList.add('form-select-sm');
        }

        this.input.placeholder = this.options.placeholder;
        this.input.setAttribute('autocomplete', 'off');
        this.input.setAttribute('spellcheck', 'false');
        this.input.readOnly = true; // Closed state is a read-only dropdown trigger
        
        if (this.select.disabled) {
            this.input.disabled = true;
            this.container.classList.add('disabled');
        }

        this.inputWrapper.appendChild(this.input);
        this.container.appendChild(this.inputWrapper);
        
        // Insert in DOM before select
        this.select.parentNode.insertBefore(this.container, this.select);

        // Hide the native select accessibly without breaking HTML5 form validation (avoids "not focusable" crash)
        this.select.style.position = 'absolute';
        this.select.style.opacity = '0';
        this.select.style.height = '1px';
        this.select.style.width = '1px';
        this.select.style.margin = '-1px';
        this.select.style.padding = '0';
        this.select.style.border = '0';
        this.select.style.overflow = 'hidden';
        this.select.style.clip = 'rect(0, 0, 0, 0)';
        this.select.style.pointerEvents = 'none';
        this.select.style.zIndex = '-1';
        this.select.tabIndex = -1;

        // Set initial display value
        this._syncDisplayValue();

        this._bindEvents();
        this._setupMutationObserver();
    }

    _syncDisplayValue() {
        const currentVal = this.select.value;
        if (currentVal !== undefined && currentVal !== null && currentVal !== '') {
            const match = this.data.find(d => String(d.value) === String(currentVal) || d.text.toLowerCase() === String(currentVal).toLowerCase());
            if (match) {
                this.input.value = match.text;
            } else if (this.options.allowCustom) {
                this.input.value = currentVal;
            } else {
                // If there is an option with matching value
                const opt = Array.from(this.select.options).find(o => String(o.value) === String(currentVal));
                this.input.value = opt ? opt.textContent.trim() : currentVal;
            }
        } else {
            // Check if there is an empty-value option selected (e.g. "All Clients" or "None (0%)")
            const selIdx = this.select.selectedIndex;
            if (selIdx >= 0 && this.select.options[selIdx]) {
                const opt = this.select.options[selIdx];
                const match = this.data.find(d => String(d.value) === String(opt.value));
                if (match) {
                    this.input.value = match.text;
                } else if (!opt.value && opt.textContent && !opt.textContent.toLowerCase().includes('select') && !opt.textContent.toLowerCase().includes('choose')) {
                    this.input.value = opt.textContent.trim();
                } else {
                    this.input.value = '';
                }
            } else {
                this.input.value = '';
            }
        }
    }

    _setupMutationObserver() {
        if (window.MutationObserver) {
            this._observer = new MutationObserver(() => {
                this.updateOptions();
            });
            this._observer.observe(this.select, { 
                childList: true, 
                subtree: true, 
                attributes: true, 
                attributeFilter: ['disabled', 'value'] 
            });
        }
    }

    _syncCustomValue(val) {
        const trimmed = (val || '').trim();
        const match = this.data.find(d => d.value.toLowerCase() === trimmed.toLowerCase() || d.text.toLowerCase() === trimmed.toLowerCase());
        if (match) {
            if (this.select.value !== match.value) {
                this.select.value = match.value;
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            let customOpt = Array.from(this.select.options).find(o => o.dataset.custom === 'true');
            if (!customOpt) {
                customOpt = document.createElement('option');
                customOpt.dataset.custom = 'true';
                this.select.appendChild(customOpt);
            }
            customOpt.value = trimmed;
            customOpt.textContent = trimmed;
            this.select.value = trimmed;
            this.select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    _bindEvents() {
        // Clicking container or input when closed opens the dropdown
        this.container.addEventListener('click', (e) => {
            if (this.select.disabled) return;
            if (!this.isOpen) {
                this.open();
            }
        });

        this.input.addEventListener('focus', () => {
            if (this.select.disabled) return;
            if (!this.isOpen) {
                this.open();
            }
        });

        this.input.addEventListener('input', (e) => {
            if (!this.isOpen) return;
            const val = e.target.value;
            this.filter(val);
            if (this.options.allowCustom) {
                this._syncCustomValue(val);
            }
        });
        
        this.input.addEventListener('keydown', (e) => {
            if (this.select.disabled) return;

            // When closed: Space, Enter, or ArrowDown opens the dropdown
            if (!this.isOpen) {
                if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.open();
                    return;
                }
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
                return;
            }
            if (e.key === 'ArrowDown' && this.isOpen) {
                e.preventDefault();
                this._focusNext();
                return;
            }
            if (e.key === 'ArrowUp' && this.isOpen) {
                e.preventDefault();
                this._focusPrev();
                return;
            }
            if (e.key === 'Enter' && this.isOpen) {
                e.preventDefault();
                const activeItem = UniversalSearchSelect.portal.querySelector('.uss-item.hover') || UniversalSearchSelect.portal.querySelector('.uss-item');
                if (activeItem) {
                    this.selectItem(activeItem.dataset.value);
                } else {
                    this.close();
                }
                return;
            }
            if (e.key === 'Tab') {
                if (this.isOpen) {
                    this.close();
                }
            }
        });

        // Global listeners for positioning and closing
        if (!UniversalSearchSelect._globalListenersAttached) {
            document.addEventListener('click', (e) => {
                if (UniversalSearchSelect.activeInstance && 
                    !UniversalSearchSelect.activeInstance.container.contains(e.target) &&
                    (!UniversalSearchSelect.portal || !UniversalSearchSelect.portal.contains(e.target))) {
                    UniversalSearchSelect.activeInstance.close();
                }
            }, true);

            window.addEventListener('scroll', () => {
                if (UniversalSearchSelect.activeInstance) {
                    UniversalSearchSelect.activeInstance._positionPortal();
                }
            }, true);

            let lastWidth = window.innerWidth;
            window.addEventListener('resize', () => {
                if (UniversalSearchSelect.activeInstance) {
                    // Only close on significant width change; reposition on height resize (e.g. virtual keyboard)
                    if (Math.abs(window.innerWidth - lastWidth) > 10) {
                        UniversalSearchSelect.activeInstance.close();
                        lastWidth = window.innerWidth;
                    } else {
                        UniversalSearchSelect.activeInstance._positionPortal();
                    }
                }
            });

            UniversalSearchSelect._globalListenersAttached = true;
        }

        // Programmatic change synchronization
        this.select.addEventListener('change', () => {
            this._syncDisplayValue();
            this.container.classList.remove('error');
            this.input.classList.remove('error');
        });

        // HTML5 validation error indication
        this.select.addEventListener('invalid', () => {
            this.container.classList.add('error');
            this.input.classList.add('error');
        });

        // Form reset synchronization
        this.form = this.select.closest('form');
        if (this.form) {
            this.form.addEventListener('reset', () => {
                setTimeout(() => {
                    this._syncDisplayValue();
                    this.container.classList.remove('error');
                    this.input.classList.remove('error');
                }, 10);
            });
        }
    }

    static _getPortal() {
        if (!UniversalSearchSelect.portal) {
            UniversalSearchSelect.portal = document.createElement('div');
            UniversalSearchSelect.portal.id = 'uss-portal';
            UniversalSearchSelect.portal.style.position = 'absolute';
            document.body.appendChild(UniversalSearchSelect.portal);
        }
        return UniversalSearchSelect.portal;
    }

    open() {
        if (this.select.disabled) return;
        if (UniversalSearchSelect.activeInstance && UniversalSearchSelect.activeInstance !== this) {
            UniversalSearchSelect.activeInstance.close();
        }

        UniversalSearchSelect.activeInstance = this;
        this.isOpen = true;
        this.container.classList.add('open');
        this.input.readOnly = false; // Enabled for search typing while open
        
        // Refresh options data before opening
        this.data = this._extractData();
        this.filteredData = [...this.data];
        this._renderDropdown();
        this._positionPortal();
        
        const portal = UniversalSearchSelect._getPortal();
        portal.classList.add('active');

        // Select input text so user can immediately type to search
        setTimeout(() => {
            if (document.activeElement === this.input) {
                this.input.select();
            } else {
                this.input.focus();
                this.input.select();
            }
        }, 0);

        // Mobile UX: Scroll input comfortably into visible area if near screen edge
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                const rect = this.input.getBoundingClientRect();
                if (rect.top < 60 || rect.bottom > window.innerHeight - 100) {
                    this.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => this._positionPortal(), 250);
                }
            }, 60);
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.container.classList.remove('open');
        this.input.readOnly = true; // Lock back to readonly trigger display
        
        const portal = UniversalSearchSelect._getPortal();
        portal.classList.remove('active');
        UniversalSearchSelect.activeInstance = null;
        
        const val = this.input.value.trim();
        if (this.options.allowCustom) {
            const match = this.data.find(d => d.value.toLowerCase() === val.toLowerCase() || d.text.toLowerCase() === val.toLowerCase());
            if (match) {
                this.input.value = match.text;
                if (this.select.value !== match.value) {
                    this.select.value = match.value;
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (val) {
                this.input.value = val;
                this._syncCustomValue(val);
            } else {
                this.input.value = '';
                if (this.select.value !== '') {
                    this.select.value = '';
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } else {
            const match = this.data.find(d => d.value.toLowerCase() === val.toLowerCase() || d.text.toLowerCase() === val.toLowerCase());
            if (match) {
                this.input.value = match.text;
                if (this.select.value !== match.value) {
                    this.select.value = match.value;
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (!val) {
                this.input.value = '';
                if (this.select.value !== '') {
                    this.select.value = '';
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                // Revert to current selected item's text if search didn't match
                this._syncDisplayValue();
            }
        }
    }

    static closeAll() {
        if (UniversalSearchSelect.activeInstance) {
            UniversalSearchSelect.activeInstance.close();
        }
    }

    filter(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(item => 
                item.text.toLowerCase().includes(q) ||
                (item.category && item.category.toLowerCase().includes(q))
            );
        }
        this._renderDropdown();
        this._positionPortal();
    }

    _renderDropdown() {
        const portal = UniversalSearchSelect._getPortal();
        const currentVal = this.select.value;

        if (this.filteredData.length === 0) {
            portal.innerHTML = '<div class="uss-no-results">No matches found</div>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'uss-list';

        this.filteredData.forEach((item) => {
            const div = document.createElement('div');
            const isSelected = String(item.value) === String(currentVal) || (!currentVal && !item.value);
            div.className = `uss-item ${isSelected ? 'selected' : ''}`;
            div.dataset.value = item.value;
            if (item.category) {
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                        <span style="font-weight:500;">${item.text}</span>
                        <span class="badge" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:4px; color:#0C3925; background:rgba(12,57,37,0.08); border:1px solid rgba(12,57,37,0.15); flex-shrink:0;">${item.category}</span>
                    </div>
                `;
            } else {
                div.innerHTML = `<span>${item.text}</span>`;
            }
            
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectItem(item.value);
            });

            div.addEventListener('mouseenter', () => {
                portal.querySelectorAll('.uss-item').forEach(i => i.classList.remove('hover'));
                div.classList.add('hover');
            });

            list.appendChild(div);
        });

        portal.innerHTML = '';
        portal.appendChild(list);

        // Auto-scroll to selected option if available
        const selectedEl = list.querySelector('.uss-item.selected');
        if (selectedEl) {
            setTimeout(() => {
                selectedEl.scrollIntoView({ block: 'nearest' });
            }, 0);
        }
    }

    _positionPortal() {
        const portal = UniversalSearchSelect._getPortal();
        const rect = this.input.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Check for visible mobile bottom navigation
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        const bottomNavHeight = (bottomNav && window.getComputedStyle(bottomNav).display !== 'none') 
            ? (bottomNav.offsetHeight + 14) 
            : 0;
            
        const bottomSafeMargin = Math.max(16, bottomNavHeight);
        const topSafeMargin = 16;
        
        const spaceBelow = viewportHeight - rect.bottom - bottomSafeMargin;
        const spaceAbove = rect.top - topSafeMargin;
        
        // Flip upward if space below is tiny (< 150px) and space above is larger
        const shouldFlip = spaceBelow < 150 && spaceAbove > spaceBelow;
        
        // Clamp portal max-height strictly to available space and sensible max
        const maxAvailableHeight = shouldFlip ? Math.max(90, spaceAbove) : Math.max(90, spaceBelow);
        const clampedMaxHeight = Math.min(260, maxAvailableHeight);
        portal.style.maxHeight = `${clampedMaxHeight}px`;

        // Calculate portal width with viewport clamping
        let portalWidth = Math.max(rect.width, 180);
        if (viewportWidth <= 768) {
            portalWidth = Math.min(portalWidth, viewportWidth - 20);
        }
        portal.style.width = `${portalWidth}px`;

        // Clamp horizontal coordinates inside screen boundaries
        let left = rect.left + window.scrollX;
        if (rect.left + portalWidth > viewportWidth - 10) {
            left = Math.max(10, viewportWidth - portalWidth - 10) + window.scrollX;
        }
        left = Math.max(10 + window.scrollX, left);
        portal.style.left = `${left}px`;

        // Measure actual rendered portal height after max-height is set
        const portalHeight = portal.offsetHeight || 160;
        let top = 0;
        if (shouldFlip) {
            top = rect.top + window.scrollY - portalHeight - 4;
        } else {
            top = rect.bottom + window.scrollY + 4;
        }
        portal.style.top = `${top}px`;
    }

    selectItem(value) {
        const item = this.data.find(d => String(d.value) === String(value));
        if (item) {
            this.input.value = item.text;
            this.select.value = value;
            this.select.dispatchEvent(new Event('change', { bubbles: true }));
            if (this.options.onSelect) this.options.onSelect(value, item.text);
        } else if (this.options.allowCustom) {
            this.input.value = value;
            this._syncCustomValue(value);
        } else {
            this.select.value = value;
            this._syncDisplayValue();
            this.select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.close();
    }

    _focusNext() {
        const portal = UniversalSearchSelect._getPortal();
        const items = portal.querySelectorAll('.uss-item');
        if (!items.length) return;
        const current = portal.querySelector('.uss-item.hover');
        let nextIndex = 0;

        if (current) {
            nextIndex = Array.from(items).indexOf(current) + 1;
            if (nextIndex >= items.length) nextIndex = 0;
            current.classList.remove('hover');
        }
        items[nextIndex].classList.add('hover');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    }

    _focusPrev() {
        const portal = UniversalSearchSelect._getPortal();
        const items = portal.querySelectorAll('.uss-item');
        if (!items.length) return;
        const current = portal.querySelector('.uss-item.hover');
        let nextIndex = items.length - 1;

        if (current) {
            nextIndex = Array.from(items).indexOf(current) - 1;
            if (nextIndex < 0) nextIndex = items.length - 1;
            current.classList.remove('hover');
        }
        items[nextIndex].classList.add('hover');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    }

    updateOptions() {
        this.data = this._extractData();
        this.filteredData = [...this.data];
        this._syncDisplayValue();

        if (this.select.disabled) {
            this.input.disabled = true;
            this.container.classList.add('disabled');
        } else {
            this.input.disabled = false;
            this.container.classList.remove('disabled');
        }
    }

    destroy() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.select) {
            this.select.style.position = '';
            this.select.style.opacity = '';
            this.select.style.height = '';
            this.select.style.width = '';
            this.select.style.margin = '';
            this.select.style.padding = '';
            this.select.style.border = '';
            this.select.style.overflow = '';
            this.select.style.clip = '';
            this.select.style.pointerEvents = '';
            this.select.style.zIndex = '';
            this.select.tabIndex = 0;
            delete this.select._ussInstance;
            delete this.select.dataset.ussInitialized;
        }
    }

    static isSearchableSelect(select) {
        if (!select || select.getAttribute('data-native') === 'true' || select.closest('#root')) {
            return false;
        }

        // Exclude pagination selects, explicit native selects, and internal switcher
        if (select.classList.contains('pagination-size-select') ||
            select.classList.contains('form-select-native') ||
            select.id === 'rbac-role-select' ||
            select.id === 'matrix-role-selector' ||
            select.closest('.pagination')) {
            return false;
        }

        // Exclude hidden inputs that are not already enhanced
        if ((select.type === 'hidden' || (select.style.display === 'none' && !select._ussInstance)) && !select.dataset.searchable) {
            return false;
        }

        // All other standard selects across forms, modals, tables, and filters are enhanced
        return true;
    }

    // Static helper to initialize eligible dropdown elements
    static initAll(rootEl = document) {
        const root = (typeof rootEl === 'string' ? document.querySelector(rootEl) : rootEl) || document;
        root.querySelectorAll('select').forEach(select => {
            const shouldBeSearchable = UniversalSearchSelect.isSearchableSelect(select);

            if (!shouldBeSearchable) {
                // If previously upgraded, cleanly revert to native select
                if (select._ussInstance) {
                    select._ussInstance.destroy();
                }
                const siblingContainer = select.parentNode ? (
                    (select.previousElementSibling && select.previousElementSibling.classList.contains('uss-container'))
                        ? select.previousElementSibling
                        : (select.id ? select.parentNode.querySelector(`:scope > .uss-container[data-source-id="${select.id}"]`) : null)
                ) : null;
                if (siblingContainer) {
                    siblingContainer.parentNode.removeChild(siblingContainer);
                }
                select.style.display = '';
                if (!select.classList.contains('form-select') && !select.classList.contains('pagination-size-select')) {
                    select.classList.add('form-select');
                }
                return;
            }

            // Otherwise, enhance with UniversalSearchSelect
            if (!select.dataset.ussInitialized || !select._ussInstance) {
                new UniversalSearchSelect(select);
                select.dataset.ussInitialized = 'true';
            } else {
                const instance = select._ussInstance;
                if (instance) {
                    instance.updateOptions();
                }
            }
        });
    }
}

// Global hook for easy access
window.UniversalSearchSelect = UniversalSearchSelect;
