using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
class LiveViewerShim {
 static string Quote(string value) { char slash=(char)92, quote=(char)34; if(value.Length>0 && value.IndexOfAny(new[]{' ', (char)9, quote})<0)return value; var b=new StringBuilder().Append(quote); int slashes=0; foreach(char c in value){if(c==slash){slashes++;continue;} if(c==quote){b.Append(slash,slashes*2+1);b.Append(c);}else{b.Append(slash,slashes);b.Append(c);}slashes=0;}b.Append(slash,slashes*2);b.Append(quote);return b.ToString(); }
 static async System.Threading.Tasks.Task Pump(Stream input,Stream output,bool closeOutput) {var buffer=new byte[8192];try{int count;while((count=await input.ReadAsync(buffer,0,buffer.Length))>0){await output.WriteAsync(buffer,0,count);await output.FlushAsync();}}finally{if(closeOutput)output.Close();}}
 static int Main(string[] args) {
  try {
   string directory=AppDomain.CurrentDomain.BaseDirectory;
   var config=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,"runtime-config.json")));
   var command=new StringBuilder(Quote(Path.Combine(directory,"runtime.mjs")));
   foreach(var arg in args)command.Append(" ").Append(Quote(arg));
   var info=new ProcessStartInfo((string)config["node"],command.ToString()){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   using(var child=Process.Start(info)){
    var input=Pump(Console.OpenStandardInput(),child.StandardInput.BaseStream,true);
    input.ContinueWith(t=>{try{child.StandardInput.Close();}catch{}});
    var output=Pump(child.StandardOutput.BaseStream,Console.OpenStandardOutput(),false);
    var error=Pump(child.StandardError.BaseStream,Console.OpenStandardError(),false);
    child.WaitForExit();System.Threading.Tasks.Task.WaitAll(output,error);return child.ExitCode;
   }
  } catch(Exception error) {Console.Error.WriteLine("[live-viewer] "+error.Message);return 1;}
 }
}
