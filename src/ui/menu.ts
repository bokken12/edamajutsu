import * as vscode from 'vscode';

export interface MenuItem {
  key: string;
  label: string;
  description?: string;
  action: () => void | Thenable<void> | Thenable<unknown>;
}

export interface Menu {
  title: string;
  items: ReadonlyArray<MenuItem>;
}

interface MenuQuickPickItem extends vscode.QuickPickItem {
  menuItem: MenuItem;
}

// Single-key-dispatch quick-pick menu, modeled on edamagit's MenuUtil.
// Pressing a key that matches `item.key` immediately fires that item's action;
// arrow keys + Enter also work. `q` or Escape cancels.
export function showMenu(menu: Menu): Promise<void> {
  const items: MenuQuickPickItem[] = menu.items.map((item) => {
    const qpi: MenuQuickPickItem = {
      label: item.key,
      description: `\t${item.label}`,
      menuItem: item
    };
    if (item.description !== undefined) {
      qpi.detail = item.description;
    }
    return qpi;
  });

  return new Promise<void>((resolve, reject) => {
    const quickPick = vscode.window.createQuickPick<MenuQuickPickItem>();
    quickPick.title = menu.title;
    quickPick.items = items;

    let chosen: MenuItem | undefined;

    const fire = (item: MenuItem): void => {
      chosen = item;
      quickPick.hide();
    };

    const onChange = quickPick.onDidChangeValue((value) => {
      if (value === 'q') {
        quickPick.hide();
        return;
      }
      const match = items.find((i) => i.menuItem.key === value);
      if (match) {
        quickPick.value = '';
        fire(match.menuItem);
      }
    });

    const onAccept = quickPick.onDidAccept(() => {
      const [active] = quickPick.activeItems;
      if (active) {
        fire(active.menuItem);
      }
    });

    const onHide = quickPick.onDidHide(() => {
      onChange.dispose();
      onAccept.dispose();
      onHide.dispose();
      quickPick.dispose();
      if (!chosen) {
        resolve();
        return;
      }
      Promise.resolve(chosen.action()).then(
        () => resolve(),
        (err) => reject(err)
      );
    });

    quickPick.show();
  });
}
