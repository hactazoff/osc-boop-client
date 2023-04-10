Set oShell = CreateObject ("Wscript.Shell") 
Dim strArgs
strArgs = "npm start"
oShell.Run strArgs, 0, false