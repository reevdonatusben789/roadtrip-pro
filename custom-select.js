(() => {
  const enhanceSelect = (select) => {
    if (select.dataset.customized === "true" || select.multiple) return;
    select.dataset.customized = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-native";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `${select.id}-options`);
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "Select an option");
    trigger.innerHTML = '<span></span><b aria-hidden="true">⌄</b>';

    const menu = document.createElement("div");
    menu.className = "custom-select-menu";
    menu.id = `${select.id}-options`;
    menu.setAttribute("role", "listbox");
    menu.tabIndex = -1;
    wrapper.insertBefore(trigger, select);
    wrapper.appendChild(menu);

    let activeIndex = -1;
    const options = () => Array.from(select.options);
    const renderOptions = () => {
      menu.innerHTML = "";
      options().forEach((option, index) => {
        const item = document.createElement("div");
        item.className = "custom-select-option";
        item.textContent = option.textContent;
        item.setAttribute("role", "option");
        item.dataset.index = index;
        item.addEventListener("click", () => choose(index));
        menu.appendChild(item);
      });
    };
    const update = () => {
      const selected = select.options[select.selectedIndex];
      trigger.querySelector("span").textContent = selected?.textContent || "Choose an option";
      menu.querySelectorAll("[role=option]").forEach((option, index) => {
        const isSelected = index === select.selectedIndex;
        option.classList.toggle("selected", isSelected);
        option.setAttribute("aria-selected", isSelected);
      });
    };
    const close = () => {
      wrapper.classList.remove("open", "drop-up");
      trigger.setAttribute("aria-expanded", "false");
    };
    const open = () => {
      wrapper.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      const spaceBelow = trigger.getBoundingClientRect().bottom;
      wrapper.classList.toggle("drop-up", window.innerHeight - spaceBelow < 300);
      activeIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      menu.querySelectorAll("[role=option]")[activeIndex]?.scrollIntoView({ block: "nearest" });
    };
    const choose = (index) => {
      const option = options()[index];
      if (!option) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      update();
      close();
    };

    renderOptions();
    select.addEventListener("change", update);
    new MutationObserver(() => {
      renderOptions();
      update();
    }).observe(select, { childList: true });
    trigger.addEventListener("click", () => wrapper.classList.contains("open") ? close() : open());
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!wrapper.classList.contains("open")) open();
        activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + options().length) % options().length;
        menu.querySelectorAll("[role=option]")[activeIndex]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && wrapper.classList.contains("open")) {
        event.preventDefault();
        choose(activeIndex);
      } else if (event.key === "Escape") {
        close();
      }
    });
    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target)) close();
    });
    update();
  };

  const enhanceAll = () => document.querySelectorAll("select:not([data-customized])").forEach(enhanceSelect);
  enhanceAll();
  new MutationObserver(enhanceAll).observe(document.body, { childList: true, subtree: true });
})();
