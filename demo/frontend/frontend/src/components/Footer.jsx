import React from "react";
import { 
  Video, 
  Twitter, 
  Github, 
  Linkedin, 
  Youtube, 
  Globe, 
  ChevronDown 
} from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-[#18181B] text-white pt-20 pb-10 px-6 md:px-12 rounded-t-[3rem] mt-12 w-full">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Top Row: Language & Socials */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-6">
           <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-sm font-semibold hover:text-gray-300 transition">
                 English <ChevronDown size={14} />
              </button>
              <div className="h-4 w-[1px] bg-gray-700"></div>
              {/* Social Icons */}
              <div className="flex gap-4">
                 {[Twitter, Github, Linkedin, Youtube, Globe].map((Icon, idx) => (
                    <a key={idx} href="#" className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all">
                       <Icon size={16} />
                    </a>
                 ))}
              </div>
           </div>
        </div>

        {/* Middle Row: Links Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-20 text-sm">
           
           {/* Column 1 */}
           <div className="space-y-4">
              <h4 className="font-bold text-base mb-2">Annotation Tools</h4>
              <ul className="space-y-3 text-gray-400">
                 <li><a href="#" className="hover:text-white transition">Video Labeling</a></li>
                 <li><a href="#" className="hover:text-white transition">Auto Detection (AI)</a></li>
                 <li><a href="#" className="hover:text-white transition">Timeline Editor</a></li>
                 <li><a href="#" className="hover:text-white transition">Export to JSON/CSV</a></li>
              </ul>
           </div>

           {/* Column 2 */}
           <div className="space-y-4">
              <h4 className="font-bold text-base mb-2">AI Features</h4>
              <ul className="space-y-3 text-gray-400">
                 <li><a href="#" className="hover:text-white transition">Action Recognition</a></li>
                 <li><a href="#" className="hover:text-white transition">Pose Estimation</a></li>
                 <li><a href="#" className="hover:text-white transition">Face Tracking</a></li>
              </ul>
           </div>

           {/* Column 3 */}
           <div className="space-y-4">
              <h4 className="font-bold text-base mb-2">Resources</h4>
              <ul className="space-y-3 text-gray-400">
                 <li><a href="#" className="hover:text-white transition">Documentation</a></li>
                 <li><a href="#" className="hover:text-white transition">API Reference</a></li>
                 <li><a href="#" className="hover:text-white transition">Community Forum</a></li>
              </ul>
           </div>

           {/* Column 4 */}
           <div className="space-y-4">
              <h4 className="font-bold text-base mb-2">Company</h4>
              <ul className="space-y-3 text-gray-400">
                 <li><a href="#" className="hover:text-white transition">About Project</a></li>
                 <li><a href="#" className="hover:text-white transition">Contact Us</a></li>
                 <li><a href="#" className="hover:text-white transition">Privacy Policy</a></li>
              </ul>
           </div>
           
           {/* Column 5 */}
           <div className="col-span-2 lg:col-span-1 space-y-4">
              <h4 className="font-bold text-base mb-2">Get Started</h4>
              <p className="text-gray-400 mb-4">Ready to analyze your classroom videos?</p>
              <button className="bg-white text-black px-6 py-2.5 rounded-full font-bold hover:bg-gray-200 transition w-full lg:w-auto">
                 Sign Up Free
              </button>
           </div>

        </div>

        {/* Bottom Row: Logo & Copyright */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-800">
           <div className="mb-4 md:mb-0">
              <h2 className="text-3xl font-black tracking-tighter flex items-center gap-2">
                 <Video size={28} fill="white" />
                 ANNOTATION.IO
              </h2>
              <p className="text-gray-500 text-xs mt-1">© 2024 Student Action Annotation Project.</p>
           </div>
           <div className="flex gap-6 text-xs text-gray-500 font-medium">
              <a href="#" className="hover:text-white transition">Privacy</a>
              <a href="#" className="hover:text-white transition">Terms</a>
              <a href="#" className="hover:text-white transition">Cookies</a>
           </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;