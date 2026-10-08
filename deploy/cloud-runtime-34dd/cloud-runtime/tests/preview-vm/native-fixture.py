import tkinter as tk, json, pathlib, os, sys
root=tk.Tk();root.title('Vibyra Cloud Preview Fixture');root.geometry('500x350+100+100')
value=tk.StringVar();entry=tk.Entry(root,textvariable=value);entry.place(x=20,y=70,width=300,height=40)
label=tk.Label(root,text='Ready');label.place(x=20,y=20,width=300,height=40)
def save():
    pathlib.Path('/tmp/project/preview-input').write_text(value.get());label.config(text='Saved '+value.get())
button=tk.Button(root,text='Save',command=save);button.place(x=20,y=140,width=180,height=50)
def ready():
    root.deiconify();root.update_idletasks()
    if not root.winfo_ismapped() or root.winfo_width()<320 or root.winfo_height()<220:
        root.after(50,ready);return
    root.update()
    info={'id':root.winfo_id(),'x':root.winfo_rootx(),'y':root.winfo_rooty(),'width':root.winfo_width(),'height':root.winfo_height(),'mapped':root.winfo_ismapped()}
    pathlib.Path('/tmp/project/preview-ready').write_text(json.dumps(info))
# A native launch explicitly presents its window; do not capture an iconic window.
root.after(350,ready);root.mainloop()
